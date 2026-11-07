const request = require("supertest");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const {
  seedCustomer,
  seedCustomerVehicle,
  seedSource,
  seedAdmin,
  JOB_LAT,
  JOB_LNG,
} = require("../helpers/seed");
const { customerToken, adminToken, bearer } = require("../helpers/tokens");
const { configureSkipcashEnv, fakeSkipcash, sendWebhook } = require("../helpers/skipcash");
const {
  CustomerSubscription,
  SubscriptionPlan,
  ServiceRequest,
  Refund,
  PaymentAttempt,
  Job,
} = require("../../clicks-shared/models");
const { seedMembershipPlans, addMonths } = require("../../clicks-shared/services/membershipPlans");
const {
  resolveCover,
  releaseMembershipQuota,
  consumeOnComplete,
} = require("../../clicks-shared/services/membershipEntitlement");
const { createJobRecord } = require("../../clicks-shared/services/createJobRecord");

let techApp;
let adminApp;
let sc;

beforeAll(async () => {
  configureSkipcashEnv();
  process.env.LAUNCH_CUSTOMER_MEMBERSHIP = "true";
  await connectTestDb();
  ({ app: techApp } = require("../../clicks-customer-tech-api/src/createApp").createTechApp());
  adminApp = require("../../clicks-admin-api/src/createApp").createAdminApp();
});

afterAll(async () => {
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearCollections();
  await seedMembershipPlans(SubscriptionPlan);
  sc = fakeSkipcash();
  techApp.set("skipcashFetch", sc.fetch);
});

function checkout(customer, vehicle, plan, interval = "month") {
  return request(techApp)
    .post("/api/membership/checkout")
    .set(bearer(customerToken(customer._id)))
    .send({
      plan_id: plan._id.toString(),
      interval,
      customer_vehicle_id: vehicle._id.toString(),
    });
}

function payWebhook(body, subId) {
  return sendWebhook(techApp, {
    PaymentId: body.payment_id,
    Amount: body.amount,
    StatusId: 2,
    TransactionId: `tx-${body.payment_id}`.slice(0, 40),
    Custom1: subId || body.subscription_id,
    Custom2: "membership",
    VisaId: "visa",
  });
}

async function memberWithActivePlan(code = "plus") {
  const customer = await seedCustomer();
  const vehicle = await seedCustomerVehicle(customer);
  const plan = await SubscriptionPlan.findOne({ code });
  const res = await checkout(customer, vehicle, plan, "month");
  expect((await payWebhook(res.body)).status).toBe(200);
  const sub = await CustomerSubscription.findById(res.body.subscription_id);
  expect(sub.status).toBe("active");
  return { customer, vehicle, plan, sub };
}

describe("Membership checkout (scenarios 93, 94)", () => {
  test("double tap: one SkipCash payment, one pending subscription, same link", async () => {
    const customer = await seedCustomer();
    const vehicle = await seedCustomerVehicle(customer);
    const plan = await SubscriptionPlan.findOne({ code: "plus" });
    const [a, b] = await Promise.all([
      checkout(customer, vehicle, plan),
      checkout(customer, vehicle, plan),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body.pay_url).toBe(b.body.pay_url);
    expect(sc.calls.create).toBe(1);
    expect(await CustomerSubscription.countDocuments({ customer_vehicle_id: vehicle._id })).toBe(1);
  });

  test("opening checkout twice then paying the FIRST link activates it", async () => {
    const customer = await seedCustomer();
    const vehicle = await seedCustomerVehicle(customer);
    const plan = await SubscriptionPlan.findOne({ code: "plus" });
    const monthly = await checkout(customer, vehicle, plan, "month");
    const yearly = await checkout(customer, vehicle, plan, "year");
    expect(yearly.body.subscription_id).not.toBe(monthly.body.subscription_id);
    // The first checkout is NOT cancelled by the second.
    expect((await CustomerSubscription.findById(monthly.body.subscription_id)).status).toBe(
      "pending_payment"
    );

    expect((await payWebhook(monthly.body)).status).toBe(200);
    const first = await CustomerSubscription.findById(monthly.body.subscription_id);
    expect(first.status).toBe("active");

    const status = await request(techApp)
      .get(`/api/membership/${first._id}/status`)
      .set(bearer(customerToken(customer._id)));
    expect(status.body.subscription_status).toBe("active");

    // Paying the second link too: paid_duplicate + refund case, still 200.
    const second = await payWebhook(yearly.body);
    expect(second.status).toBe(200);
    expect(second.body.status).toBe("paid_duplicate");
    const dup = await request(techApp)
      .get(`/api/membership/${yearly.body.subscription_id}/status`)
      .set(bearer(customerToken(customer._id)));
    expect(dup.body.subscription_status).toBe("paid_duplicate");
    expect(dup.body.message).toMatch(/refunding/i);
    const refund = await Refund.findOne({ subscription_id: yearly.body.subscription_id });
    expect(refund.status).toBe("requested");
    expect(refund.amount).toBe(299);
    expect(refund.source).toBe("membership_duplicate");
  });

  test("a subscription cancelled by the old checkout still activates when its link is paid", async () => {
    const customer = await seedCustomer();
    const vehicle = await seedCustomerVehicle(customer);
    const plan = await SubscriptionPlan.findOne({ code: "basic" });
    const res = await checkout(customer, vehicle, plan, "month");
    await CustomerSubscription.updateOne(
      { _id: res.body.subscription_id },
      { $set: { status: "cancelled" } }
    );
    await payWebhook(res.body);
    expect((await CustomerSubscription.findById(res.body.subscription_id)).status).toBe("active");
  });

  test("a membership cancelled for account deletion is never revived by a late payment", async () => {
    const customer = await seedCustomer();
    const vehicle = await seedCustomerVehicle(customer);
    const plan = await SubscriptionPlan.findOne({ code: "basic" });
    const res = await checkout(customer, vehicle, plan, "month");
    await CustomerSubscription.updateOne(
      { _id: res.body.subscription_id },
      { $set: { status: "cancelled", cancel_reason: "account_deleted", cancelled_at: new Date() } }
    );
    const hook = await payWebhook(res.body);
    expect(hook.status).toBe(200);
    const sub = await CustomerSubscription.findById(res.body.subscription_id);
    expect(sub.status).toBe("paid_duplicate");
    expect(await Refund.countDocuments({ subscription_id: sub._id })).toBe(1);
  });

  test("status poll settles a paid membership whose webhook was lost", async () => {
    const customer = await seedCustomer();
    const vehicle = await seedCustomerVehicle(customer);
    const plan = await SubscriptionPlan.findOne({ code: "plus" });
    const res = await checkout(customer, vehicle, plan, "month");
    sc.setStatus(res.body.payment_id, 2);
    const status = await request(techApp)
      .get(`/api/membership/${res.body.subscription_id}/status`)
      .set(bearer(customerToken(customer._id)));
    expect(status.body.subscription_status).toBe("active");
    expect(status.body.payment_status).toBe("paid");
    const attempt = await PaymentAttempt.findOne({ subscription_id: res.body.subscription_id });
    expect(attempt.outcome).toBe("applied");
  });
});

describe("Included-visit quota (scenario 95)", () => {
  async function coveredRequest(customer, vehicle, sub) {
    return ServiceRequest.create({
      customer_id: customer._id,
      customer_vehicle_id: vehicle._id,
      service_type: "Car Wash - Exterior",
      timing: "immediate",
      location: { type: "Point", coordinates: [JOB_LNG, JOB_LAT] },
      status: "pending",
      membership_cover: "included",
      membership_subscription_id: sub._id,
      membership_discount_percent: 0,
    });
  }

  function jobBody(customer, vehicle, source, sr) {
    return {
      customer_id: customer._id,
      customer_vehicle_id: vehicle._id,
      clientName: "Member",
      clientMobileNumber: customer.phone_number,
      issue: "Car Wash - Exterior",
      location: `${JOB_LAT},${JOB_LNG}`,
      dateTime: new Date(),
      jobType: "Car Wash",
      price: 80,
      source: source._id,
      service_request_id: sr._id,
    };
  }

  test("three jobs at once on one free visit: exactly one is covered", async () => {
    const { customer, vehicle, sub } = await memberWithActivePlan("plus");
    const source = await seedSource();
    const srs = await Promise.all([1, 2, 3].map(() => coveredRequest(customer, vehicle, sub)));
    const created = await Promise.all(
      srs.map((sr) => createJobRecord(jobBody(customer, vehicle, source, sr)))
    );
    const jobs = await Job.find({ _id: { $in: created.map((c) => c.job._id) } });
    const covers = jobs.map((j) => j.membership.cover).sort();
    expect(covers).toEqual(["discounted", "discounted", "included"]);

    const fresh = await CustomerSubscription.findById(sub._id);
    const wash = fresh.usage.find((u) => u.bucket === "wash");
    expect(wash.reserved).toBe(1);
    expect(wash.used).toBe(0);

    // While it is held, a new request is not offered the free visit.
    const cover = await resolveCover({
      customerId: customer._id,
      vehicleId: vehicle._id,
      serviceType: "Car Wash - Interior",
    });
    expect(cover.cover).toBe("discounted");

    // Cancel gives it back; completion of a held one converts reserved → used.
    const included = jobs.find((j) => j.membership.cover === "included");
    expect(await releaseMembershipQuota(included)).toBe(true);
    expect(await releaseMembershipQuota(included)).toBe(false);
    let after = (await CustomerSubscription.findById(sub._id)).usage.find((u) => u.bucket === "wash");
    expect(after.reserved).toBe(0);

    const sr4 = await coveredRequest(customer, vehicle, sub);
    const { job: fourth } = await createJobRecord(jobBody(customer, vehicle, source, sr4));
    const held = await Job.findById(fourth._id);
    expect(held.membership.cover).toBe("included");
    expect(await consumeOnComplete(held)).toBe(true);
    after = (await CustomerSubscription.findById(sub._id)).usage.find((u) => u.bucket === "wash");
    expect(after).toMatchObject({ used: 1, reserved: 0 });
  });
});

describe("Cancellation, period arithmetic and emergency cover (scenarios 96, 97)", () => {
  test("customer cancel runs to the end of the paid period; immediate is not self-serve", async () => {
    const { customer, sub } = await memberWithActivePlan("basic");
    const immediate = await request(techApp)
      .post(`/api/membership/${sub._id}/cancel`)
      .set(bearer(customerToken(customer._id)))
      .send({ immediate: true });
    expect(immediate.status).toBe(403);

    const res = await request(techApp)
      .post(`/api/membership/${sub._id}/cancel`)
      .set(bearer(customerToken(customer._id)))
      .send({ terms_accepted: true });
    expect(res.status).toBe(200);
    expect(res.body.subscription.status).toBe("active");
    expect(res.body.subscription.cancel_at_period_end).toBe(true);
    const fresh = await CustomerSubscription.findById(sub._id);
    expect(fresh.history.map((h) => h.action)).toContain("cancel_at_period_end");
    expect(new Date(res.body.ends_at).getTime()).toBe(new Date(sub.endDate).getTime());
  });

  test("addMonths uses Qatar calendar months and clamps month ends", () => {
    // 31 Jan 10:00 Qatar → 28 Feb (2027 is not a leap year), not 3 March.
    expect(addMonths(new Date("2027-01-31T07:00:00Z"), 1).toISOString()).toBe(
      "2027-02-28T07:00:00.000Z"
    );
    expect(addMonths(new Date("2028-01-31T07:00:00Z"), 1).toISOString()).toBe(
      "2028-02-29T07:00:00.000Z"
    );
    // 31 Jan 23:30 UTC is already 1 Feb in Doha → 1 March in Doha.
    expect(addMonths(new Date("2027-01-31T23:30:00Z"), 1).toISOString()).toBe(
      "2027-02-28T23:30:00.000Z"
    );
    expect(addMonths(new Date("2026-11-07T09:00:00Z"), 12).toISOString()).toBe(
      "2027-11-07T09:00:00.000Z"
    );
  });

  test("coversEmergency on the plan, toggled by an admin, controls emergency cover", async () => {
    await seedAdmin();
    await SubscriptionPlan.updateOne(
      { code: "plus" },
      { $addToSet: { eligibleServiceTypes: "Breakdown Vehicle" } }
    );
    const { customer, vehicle, plan } = await memberWithActivePlan("plus");
    const coverFor = () =>
      resolveCover({ customerId: customer._id, vehicleId: vehicle._id, serviceType: "Breakdown Vehicle" });

    expect((await coverFor()).cover).toBe("none");

    const on = await request(adminApp)
      .patch(`/api/subscription-plans/${plan._id}`)
      .set(bearer(adminToken("Super Admin")))
      .send({ coversEmergency: true });
    expect(on.status).toBe(200);
    expect(on.body.plan.coversEmergency).toBe(true);
    const covered = await coverFor();
    expect(covered.cover).toBe("discounted");
    expect(covered.discountPercent).toBe(15);

    const plans = await request(techApp)
      .get("/api/membership/plans")
      .set(bearer(customerToken(customer._id)));
    const plus = plans.body.plans.find((p) => p.code === "plus");
    expect(plus.coverage.covers_emergency).toBe(true);
    expect(plus.coverage.excluded_service_types).toEqual([]);

    await request(adminApp)
      .patch(`/api/subscription-plans/${plan._id}`)
      .set(bearer(adminToken("Super Admin")))
      .send({ coversEmergency: false });
    expect((await coverFor()).cover).toBe("none");
    const basicPlans = await request(techApp)
      .get("/api/membership/plans")
      .set(bearer(customerToken(customer._id)));
    expect(basicPlans.body.plans[0].coverage.excluded_service_types).toContain("SOS");
  });
});
