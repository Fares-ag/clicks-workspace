const request = require("supertest");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const { seedCustomer, seedCustomerVehicle, seedAdmin } = require("../helpers/seed");
const { adminToken, bearer } = require("../helpers/tokens");
const {
  CustomerSubscription,
  SubscriptionPlan,
  AdminAuditLog,
  Refund,
} = require("../../clicks-shared/models");
const { seedMembershipPlans, addMonths } = require("../../clicks-shared/services/membershipPlans");

let adminApp;

beforeAll(async () => {
  await connectTestDb();
  adminApp = require("../../clicks-admin-api/src/createApp").createAdminApp();
});

afterAll(async () => {
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearCollections();
  await seedMembershipPlans(SubscriptionPlan);
  await seedAdmin();
});

const superAdmin = () => bearer(adminToken("Super Admin"));

async function grant(vehicle, { interval = "month", months } = {}) {
  const plan = await SubscriptionPlan.findOne({ code: "plus" });
  return request(adminApp)
    .post("/api/customer-subscriptions")
    .set(superAdmin())
    .send({
      customer_vehicle_id: vehicle._id.toString(),
      plan_id: plan._id.toString(),
      interval,
      months,
      reason: "Launch goodwill",
    });
}

async function auditActions() {
  return (await AdminAuditLog.find({}).lean()).map((row) => row.action);
}

describe("Admin membership actions", () => {
  test("ops roles cannot use membership actions", async () => {
    const customer = await seedCustomer();
    const vehicle = await seedCustomerVehicle(customer);
    const plan = await SubscriptionPlan.findOne({ code: "plus" });
    for (const role of ["Job Dispatcher", "Coordinator", "Call Center Agent"]) {
      const res = await request(adminApp)
        .post("/api/customer-subscriptions")
        .set(bearer(adminToken(role)))
        .send({
          customer_vehicle_id: vehicle._id.toString(),
          plan_id: plan._id.toString(),
          interval: "month",
          reason: "x",
        });
      expect(res.status).toBe(403);
    }
    expect(await CustomerSubscription.countDocuments({})).toBe(0);
  });

  test("grant (comp) creates an active membership with no payment; second grant refused", async () => {
    const customer = await seedCustomer();
    const vehicle = await seedCustomerVehicle(customer);
    const noReason = await request(adminApp)
      .post("/api/customer-subscriptions")
      .set(superAdmin())
      .send({ customer_vehicle_id: vehicle._id.toString() });
    expect(noReason.status).toBe(400);

    const res = await grant(vehicle, { months: 3 });
    expect(res.status).toBe(201);
    expect(res.body.subscription.status).toBe("active");
    expect(res.body.subscription.comp).toBe(true);
    expect(res.body.subscription.priceQar).toBe(0);
    const sub = await CustomerSubscription.findById(res.body.subscription.id);
    expect(sub.endDate.toISOString()).toBe(addMonths(sub.startDate, 3).toISOString());

    const again = await grant(vehicle);
    expect(again.status).toBe(409);
    expect(await auditActions()).toEqual(["membership.grant"]);
  });

  test("extend, adjust usage, cancel at period end, cancel immediately — each audited", async () => {
    const customer = await seedCustomer();
    const vehicle = await seedCustomerVehicle(customer);
    const granted = await grant(vehicle);
    const id = granted.body.subscription.id;
    const before = new Date(granted.body.subscription.endDate);

    const extend = await request(adminApp)
      .post(`/api/customer-subscriptions/${id}/extend`)
      .set(superAdmin())
      .send({ days: 10, reason: "Service outage compensation" });
    expect(extend.status).toBe(200);
    expect(new Date(extend.body.subscription.endDate) - before).toBe(10 * 24 * 3600 * 1000);

    const badBucket = await request(adminApp)
      .post(`/api/customer-subscriptions/${id}/usage`)
      .set(superAdmin())
      .send({ bucket: "nope", used: 1, reason: "x" });
    expect(badBucket.status).toBe(400);

    const usage = await request(adminApp)
      .post(`/api/customer-subscriptions/${id}/usage`)
      .set(superAdmin())
      .send({ bucket: "wash", used: 1, reason: "Wash done off-app" });
    expect(usage.status).toBe(200);
    expect(usage.body.subscription.usage.find((u) => u.bucket === "wash").used).toBe(1);

    const reset = await request(adminApp)
      .post(`/api/customer-subscriptions/${id}/usage`)
      .set(superAdmin())
      .send({ bucket: "wash", delta: -1, reason: "Recorded by mistake" });
    expect(reset.body.subscription.usage.find((u) => u.bucket === "wash").used).toBe(0);

    const periodEnd = await request(adminApp)
      .post(`/api/customer-subscriptions/${id}/cancel`)
      .set(superAdmin())
      .send({ mode: "period_end", reason: "Customer asked by phone" });
    expect(periodEnd.status).toBe(200);
    expect(periodEnd.body.subscription.status).toBe("active");
    expect(periodEnd.body.subscription.cancel_at_period_end).toBe(true);

    const immediate = await request(adminApp)
      .post(`/api/customer-subscriptions/${id}/cancel`)
      .set(superAdmin())
      .send({ mode: "immediate", reason: "Fraud" });
    expect(immediate.status).toBe(200);
    expect(immediate.body.subscription.status).toBe("cancelled");
    expect(immediate.body.subscription.cancel_reason).toBe("admin");

    expect(await auditActions()).toEqual([
      "membership.grant",
      "membership.extend",
      "membership.usage_adjust",
      "membership.usage_adjust",
      "membership.cancel_period_end",
      "membership.cancel_immediate",
    ]);
    const history = (await CustomerSubscription.findById(id)).history.map((h) => h.action);
    expect(history).toEqual(
      expect.arrayContaining(["granted", "extended", "usage_adjusted", "cancel_at_period_end", "cancelled"])
    );
  });

  test("refund on a comp membership is refused; on a paid one it opens a case", async () => {
    const customer = await seedCustomer();
    const vehicle = await seedCustomerVehicle(customer);
    const granted = await grant(vehicle);
    const comp = await request(adminApp)
      .post(`/api/customer-subscriptions/${granted.body.subscription.id}/refund`)
      .set(superAdmin())
      .send({ reason: "x" });
    expect(comp.status).toBe(409);

    const plan = await SubscriptionPlan.findOne({ code: "basic" });
    const vehicle2 = await seedCustomerVehicle(customer);
    const paid = await CustomerSubscription.create({
      customer_id: customer._id,
      customer_vehicle_id: vehicle2._id,
      plan_id: plan._id,
      planCode: "basic",
      planName: "Basic",
      interval: "month",
      durationMonths: 1,
      priceQar: 29,
      status: "active",
      startDate: new Date(),
      endDate: addMonths(new Date(), 1),
      paid_at: new Date(),
    });
    const res = await request(adminApp)
      .post(`/api/customer-subscriptions/${paid._id}/refund`)
      .set(superAdmin())
      .send({ reason: "Did not use it", amount: 10 });
    expect(res.status).toBe(201);
    expect(res.body.refund.amount).toBe(10);
    expect(res.body.refund.status).toBe("requested");
    expect(await Refund.countDocuments({ subscription_id: paid._id })).toBe(1);
    expect(await auditActions()).toContain("membership.refund_request");
  });
});
