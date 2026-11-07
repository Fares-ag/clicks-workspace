const request = require("supertest");
const {
  Job,
  ServiceRequest,
  CustomerSubscription,
  SubscriptionPlan,
} = require("../../clicks-shared/models");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const {
  seedCustomer,
  seedCustomerVehicle,
  seedSource,
  seedTechnician,
  seedAdmin,
  JOB_LAT,
  JOB_LNG,
} = require("../helpers/seed");
const { customerToken, technicianToken, adminToken, bearer } = require("../helpers/tokens");
const { seedMembershipPlans } = require("../../clicks-shared/services/membershipPlans");
const { computeJobPricing } = require("../../clicks-shared/utils/jobPricing");
const { signWebhookPayload } = require("../../clicks-shared/utils/skipcash");

const SECRET = "skipcash-membership-secret";
const KEY_ID = "11111111-1111-1111-1111-111111111111";
const CLIENT_ID = "skipcash-client-id";

let techApp;
let adminApp;

/**
 * A scheduled slot inside dispatch hours (06:00–22:00 Qatar). `now + 1h` was
 * outside the window whenever the suite ran after ~21:00 Qatar, so these
 * tests failed by time of day, not by code.
 */
function nextDispatchSlot() {
  const QATAR_MS = 3 * 60 * 60 * 1000;
  const q = new Date(Date.now() + QATAR_MS);
  const tomorrow10 = Date.UTC(q.getUTCFullYear(), q.getUTCMonth(), q.getUTCDate() + 1, 10, 0, 0);
  return new Date(tomorrow10 - QATAR_MS).toISOString();
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

let paySeq = 0;

function skipcashCreateResult(overrides = {}) {
  // SkipCash issues a new payment id per created payment; the ledger is keyed on it.
  paySeq += 1;
  return {
    resultObj: {
      id: `memb-pay-1111-2222-3333-${String(paySeq).padStart(12, "0")}`,
      statusId: 0,
      created: "2026-10-29T12:00:00Z",
      payUrl: "https://skipcashtest.azurewebsites.net/pay/memb-pay-1111",
      amount: overrides.amount || "29.00",
      currency: "QAR",
      transactionId: "tx-membership-1",
      status: "new",
      ...overrides,
    },
    returnCode: 200,
    errorCode: 0,
    hasError: false,
    hasValidationError: false,
  };
}

beforeAll(async () => {
  process.env.SKIPCASH_KEY_ID = KEY_ID;
  process.env.SKIPCASH_KEY_SECRET = SECRET;
  process.env.SKIPCASH_CLIENT_ID = CLIENT_ID;
  process.env.SKIPCASH_ENV = "sandbox";
  process.env.SKIPCASH_RETURN_URL = "https://clicks.qa/app/skipcash-return";
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
  techApp.set("skipcashFetch", async () => jsonResponse(skipcashCreateResult()));
});

async function paidMembership({ interval = "month", code = "plus" } = {}) {
  const customer = await seedCustomer();
  const vehicle = await seedCustomerVehicle(customer);
  const plan = await SubscriptionPlan.findOne({ code });
  const sku = plan.intervals.find((row) => row.interval === interval);
  techApp.set("skipcashFetch", async () =>
    jsonResponse(skipcashCreateResult({ amount: Number(sku.priceQar).toFixed(2) }))
  );

  const checkout = await request(techApp)
    .post("/api/membership/checkout")
    .set(bearer(customerToken(customer._id)))
    .send({
      plan_id: plan._id.toString(),
      interval,
      customer_vehicle_id: vehicle._id.toString(),
    });
  expect(checkout.status).toBe(200);
  const subId = checkout.body.subscription_id;
  const payload = {
    PaymentId: checkout.body.payment_id,
    Amount: checkout.body.amount,
    StatusId: 2,
    TransactionId: `memb${Date.now()}`.slice(0, 40),
    Custom1: subId,
    Custom2: "membership",
    VisaId: "visa-1",
  };
  const hook = await request(techApp)
    .post("/api/webhooks/skipcash")
    .set("Authorization", signWebhookPayload(payload, SECRET))
    .send(payload);
  expect(hook.status).toBe(200);
  const sub = await CustomerSubscription.findById(subId);
  return { customer, vehicle, plan, sub, checkout };
}

describe("Customer memberships", () => {
  test("checkout month and year activate with the matching endDate", async () => {
    const month = await paidMembership({ interval: "month", code: "basic" });
    expect(month.sub.status).toBe("active");
    expect(month.sub.interval).toBe("month");
    const monthMs = new Date(month.sub.endDate) - new Date(month.sub.startDate);
    expect(monthMs).toBeGreaterThan(20 * 24 * 3600 * 1000);
    expect(monthMs).toBeLessThan(40 * 24 * 3600 * 1000);

    const customer = await seedCustomer();
    const vehicle = await seedCustomerVehicle(customer);
    const plan = await SubscriptionPlan.findOne({ code: "plus" });
    techApp.set("skipcashFetch", async () =>
      jsonResponse(skipcashCreateResult({ amount: "299.00" }))
    );
    const checkout = await request(techApp)
      .post("/api/membership/checkout")
      .set(bearer(customerToken(customer._id)))
      .send({
        plan_id: plan._id.toString(),
        interval: "year",
        customer_vehicle_id: vehicle._id.toString(),
      });
    expect(checkout.status).toBe(200);
    const payload = {
      PaymentId: checkout.body.payment_id,
      Amount: checkout.body.amount,
      StatusId: 2,
      TransactionId: `year${Date.now()}`.slice(0, 40),
      Custom1: checkout.body.subscription_id,
      Custom2: "membership",
      VisaId: "visa-2",
    };
    const hook = await request(techApp)
      .post("/api/webhooks/skipcash")
      .set("Authorization", signWebhookPayload(payload, SECRET))
      .send(payload);
    expect(hook.status).toBe(200);
    const yearSub = await CustomerSubscription.findById(checkout.body.subscription_id);
    expect(yearSub.status).toBe("active");
    const yearMs = new Date(yearSub.endDate) - new Date(yearSub.startDate);
    expect(yearMs).toBeGreaterThan(300 * 24 * 3600 * 1000);
  });

  test("service request stamps included cover and job total is 0", async () => {
    const { customer, vehicle, sub } = await paidMembership({
      interval: "month",
      code: "plus",
    });
    const sr = await request(techApp)
      .post("/api/service-requests")
      .set(bearer(customerToken(customer._id)))
      .send({
        service_type: "Car Wash - Exterior",
        timing: "scheduled",
        scheduled_for: nextDispatchSlot(),
        latitude: JOB_LAT,
        longitude: JOB_LNG,
        customer_vehicle_id: vehicle._id.toString(),
      });
    expect(sr.status).toBe(201);
    expect(sr.body.service_request.membership_cover).toBe("included");
    expect(sr.body.service_request.membership_subscription_id).toBe(sub._id.toString());

    const source = await seedSource();
    const job = await Job.create({
      customer_id: customer._id,
      customer_vehicle_id: vehicle._id,
      clientName: "Test",
      clientMobileNumber: customer.phone_number,
      issue: "Car Wash - Exterior",
      location: `${JOB_LAT},${JOB_LNG}`,
      locationCoordinates: { type: "Point", coordinates: [JOB_LNG, JOB_LAT] },
      dateTime: new Date(),
      jobType: "Car Wash",
      price: 80,
      source: source._id,
      job_status: "in_progress",
      payment_status: "unpaid",
      service_request_id: sr.body.service_request.id,
      membership: {
        cover: "included",
        included: true,
        discountPercent: 0,
        subscription_id: sub._id,
      },
    });
    const pricing = computeJobPricing(job, []);
    expect(pricing.total).toBe(0);

    job.customerSignatureUrl = "https://test.local/sig.png";
    job.customerSignedAt = new Date();
    await job.save();
    const tech = await seedTechnician();
    job.assignedTechnician = tech._id;
    await job.save();

    const completed = await request(techApp)
      .post(`/api/jobs/${job._id}/complete`)
      .set(bearer(technicianToken(tech._id)))
      .send({ job_reference: "MEMB-1" });
    expect(completed.status).toBe(200);

    const refreshed = await CustomerSubscription.findById(sub._id);
    const used = (refreshed.usage || []).reduce((sum, u) => sum + Number(u.used || 0), 0);
    expect(used).toBe(1);
  });

  test("second included visit after monthly quota is discounted not free", async () => {
    const { customer, vehicle, sub } = await paidMembership({
      interval: "month",
      code: "plus",
    });
    sub.usage = [{ bucket: "wash", used: 1 }];
    await sub.save();

    const sr = await request(techApp)
      .post("/api/service-requests")
      .set(bearer(customerToken(customer._id)))
      .send({
        service_type: "Car Wash - Interior",
        timing: "scheduled",
        scheduled_for: nextDispatchSlot(),
        latitude: JOB_LAT,
        longitude: JOB_LNG,
        customer_vehicle_id: vehicle._id.toString(),
      });
    expect(sr.status).toBe(201);
    expect(sr.body.service_request.membership_cover).toBe("discounted");
    expect(sr.body.service_request.membership_discount_percent).toBe(15);

    const source = await seedSource();
    const job = await Job.create({
      customer_id: customer._id,
      clientName: "Test",
      clientMobileNumber: customer.phone_number,
      issue: "Car Wash - Interior",
      location: `${JOB_LAT},${JOB_LNG}`,
      locationCoordinates: { type: "Point", coordinates: [JOB_LNG, JOB_LAT] },
      dateTime: new Date(),
      jobType: "Car Wash",
      price: 100,
      source: source._id,
      job_status: "in_progress",
      membership: {
        cover: "discounted",
        included: false,
        discountPercent: 15,
        subscription_id: sub._id,
      },
    });
    expect(computeJobPricing(job, []).total).toBe(85);
  });

  test("SOS-style types are not covered even with an active plan", async () => {
    const { customer, vehicle } = await paidMembership({ interval: "month", code: "plus" });
    const sr = await request(techApp)
      .post("/api/service-requests")
      .set(bearer(customerToken(customer._id)))
      .send({
        service_type: "Breakdown Vehicle",
        timing: "scheduled",
        scheduled_for: nextDispatchSlot(),
        latitude: JOB_LAT,
        longitude: JOB_LNG,
        customer_vehicle_id: vehicle._id.toString(),
      });
    expect(sr.status).toBe(201);
    expect(sr.body.service_request.membership_cover).toBe("none");
  });

  test("admin can list plans and customer memberships", async () => {
    await seedAdmin();
    const plans = await request(adminApp)
      .get("/api/subscription-plans")
      .set(bearer(adminToken("Super Admin")));
    expect(plans.status).toBe(200);
    expect(plans.body.plans.length).toBeGreaterThanOrEqual(2);

    await paidMembership({ interval: "year", code: "basic" });
    const list = await request(adminApp)
      .get("/api/customer-subscriptions")
      .set(bearer(adminToken("Super Admin")));
    expect(list.status).toBe(200);
    expect(list.body.subscriptions.length).toBeGreaterThanOrEqual(1);
    expect(list.body.subscriptions[0].interval).toBe("year");
  });
});
