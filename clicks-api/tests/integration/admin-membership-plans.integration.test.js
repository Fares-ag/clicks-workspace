/**
 * Admin control of membership plans (packages): create, edit, switch off,
 * validation that keeps the customer catalog sellable, member counts, and
 * edits reaching the customer app without touching existing memberships.
 */
const request = require("supertest");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const { seedCustomer, seedCustomerVehicle, seedAdmin } = require("../helpers/seed");
const { adminToken, customerToken, bearer } = require("../helpers/tokens");
const {
  CustomerSubscription,
  SubscriptionPlan,
  AdminAuditLog,
} = require("../../clicks-shared/models");
const { seedMembershipPlans, DEFAULT_PLANS } = require("../../clicks-shared/services/membershipPlans");

let adminApp;
let techApp;

beforeAll(async () => {
  await connectTestDb();
  adminApp = require("../../clicks-admin-api/src/createApp").createAdminApp();
  techApp = require("../../clicks-customer-tech-api/src/createApp").createTechApp().app;
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

const GOLD = {
  code: "gold",
  name_en: "Gold",
  name_ar: "ذهبي",
  discountPercent: 20,
  eligibleServiceTypes: ["Oil Change", "Battery Change"],
  coversEmergency: false,
  sortOrder: 3,
  intervals: [
    {
      interval: "month",
      durationMonths: 1,
      priceQar: 59,
      included: [{ serviceTypes: ["Car Wash - Full"], quota: 2, bucket: "wash" }],
    },
    { interval: "year", durationMonths: 12, priceQar: 499, included: [] },
  ],
};

const createPlan = (body) =>
  request(adminApp).post("/api/subscription-plans").set(superAdmin()).send(body);
const patchPlan = (id, body) =>
  request(adminApp).patch(`/api/subscription-plans/${id}`).set(superAdmin()).send(body);
const customerCatalog = async () => {
  const customer = await seedCustomer();
  const res = await request(techApp)
    .get("/api/membership/plans")
    .set(bearer(customerToken(customer._id)));
  expect(res.status).toBe(200);
  return res.body.plans;
};

test("a new package created in the admin is sold in the customer app", async () => {
  const res = await createPlan(GOLD);
  expect(res.status).toBe(201);
  expect(res.body.plan).toMatchObject({ code: "gold", discountPercent: 20, active: true });

  const plans = await customerCatalog();
  expect(plans.map((p) => p.code)).toEqual(["basic", "plus", "gold"]);
  const audit = await AdminAuditLog.findOne({ action: "membership_plan.create" });
  expect(audit).not.toBeNull();
});

test("editing price and quota reaches the catalog; existing memberships keep their terms", async () => {
  const plus = await SubscriptionPlan.findOne({ code: "plus" });
  const customer = await seedCustomer();
  const vehicle = await seedCustomerVehicle(customer);
  const grant = await request(adminApp)
    .post("/api/customer-subscriptions")
    .set(superAdmin())
    .send({
      customer_vehicle_id: vehicle._id.toString(),
      plan_id: plus._id.toString(),
      interval: "month",
      reason: "Goodwill",
    });
  expect(grant.status).toBe(201);

  const intervals = plus.toObject().intervals.map((row) =>
    row.interval === "month"
      ? { ...row, priceQar: 45, included: [{ ...row.included[0], quota: 3 }] }
      : row
  );
  const res = await patchPlan(plus._id, { intervals });
  expect(res.status).toBe(200);

  const catalogPlus = (await customerCatalog()).find((p) => p.code === "plus");
  expect(JSON.stringify(catalogPlus)).toContain("45");

  const member = await CustomerSubscription.findById(grant.body.subscription.id);
  expect(member.priceQar).toBe(0); // a comp grant; the point is it did not change
  expect(member.included[0].quota).toBe(1);
});

test("switching a package off hides it from the catalog, and on again brings it back", async () => {
  const basic = await SubscriptionPlan.findOne({ code: "basic" });
  expect((await patchPlan(basic._id, { active: false })).status).toBe(200);
  expect((await customerCatalog()).map((p) => p.code)).toEqual(["plus"]);
  expect((await patchPlan(basic._id, { active: true })).status).toBe(200);
  expect((await customerCatalog()).map((p) => p.code)).toEqual(["basic", "plus"]);
});

test("list shows how many active members each package has", async () => {
  const plus = await SubscriptionPlan.findOne({ code: "plus" });
  const customer = await seedCustomer();
  const vehicle = await seedCustomerVehicle(customer);
  await request(adminApp)
    .post("/api/customer-subscriptions")
    .set(superAdmin())
    .send({
      customer_vehicle_id: vehicle._id.toString(),
      plan_id: plus._id.toString(),
      interval: "year",
      reason: "Goodwill",
    });
  const res = await request(adminApp).get("/api/subscription-plans").set(superAdmin());
  expect(res.status).toBe(200);
  const counts = Object.fromEntries(res.body.plans.map((p) => [p.code, p.activeMembers]));
  expect(counts).toEqual({ basic: 0, plus: 1 });
});

describe("validation keeps every package sellable", () => {
  test.each([
    ["a 0 QAR price", { intervals: [{ ...GOLD.intervals[0], priceQar: 0 }] }, /more than 0 QAR/],
    ["a discount over 100%", { discountPercent: 120 }, /between 0 and 100/],
    ["monthly listed twice", { intervals: [GOLD.intervals[0], GOLD.intervals[0]] }, /listed twice/],
    [
      "an included item with no service",
      { intervals: [{ ...GOLD.intervals[0], included: [{ serviceTypes: [], quota: 1 }] }] },
      /at least one service/,
    ],
    [
      "a fractional quantity",
      { intervals: [{ ...GOLD.intervals[0], included: [{ serviceTypes: ["Oil Change"], quota: 1.5 }] }] },
      /whole number/,
    ],
    [
      "two items sharing one counter",
      {
        intervals: [
          {
            ...GOLD.intervals[0],
            included: [
              { serviceTypes: ["Oil Change"], quota: 1, bucket: "x" },
              { serviceTypes: ["Battery Change"], quota: 1, bucket: "x" },
            ],
          },
        ],
      },
      /share the counter/,
    ],
    ["no billing option on an active plan", { intervals: [] }, /at least one billing option/],
    ["a code with spaces", { code: "gold plan" }, /Code must be/],
  ])("refuses %s with a 400 the admin can read", async (_label, override, pattern) => {
    const res = await createPlan({ ...GOLD, ...override });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_PLAN");
    expect(res.body.message).toMatch(pattern);
    expect(await SubscriptionPlan.countDocuments({ code: "gold" })).toBe(0);
  });

  test("an edit with a bad price is refused and changes nothing", async () => {
    const plus = await SubscriptionPlan.findOne({ code: "plus" });
    const res = await patchPlan(plus._id, {
      intervals: [{ interval: "month", durationMonths: 1, priceQar: -5, included: [] }],
    });
    expect(res.status).toBe(400);
    const after = await SubscriptionPlan.findById(plus._id);
    expect(after.intervals.map((r) => r.priceQar)).toEqual([39, 299]);
  });

  test("switching off is never blocked by an older bad field", async () => {
    const plus = await SubscriptionPlan.findOne({ code: "plus" });
    await SubscriptionPlan.updateOne({ _id: plus._id }, { $set: { "intervals.0.priceQar": 0 } });
    expect((await patchPlan(plus._id, { active: false })).status).toBe(200);
    expect((await SubscriptionPlan.findById(plus._id)).active).toBe(false);
  });

  test("renaming a code to one that exists is a 409", async () => {
    const basic = await SubscriptionPlan.findOne({ code: "basic" });
    const res = await patchPlan(basic._id, { code: "plus" });
    expect(res.status).toBe(409);
  });

  test("only full admins can manage packages", async () => {
    await seedAdmin({ _id: "507f1f77bcf86cd799439022", role: "Job Dispatcher" });
    const res = await request(adminApp)
      .get("/api/subscription-plans")
      .set(bearer(adminToken("Job Dispatcher", "507f1f77bcf86cd799439022")));
    expect(res.status).toBe(403);
  });
});

test("meta lists the service names the editor offers", async () => {
  const res = await request(adminApp).get("/api/subscription-plans/meta").set(superAdmin());
  expect(res.status).toBe(200);
  expect(res.body.serviceTypes).toContain("Oil Change");
  expect(res.body.emergencyServiceTypes).toContain("Breakdown Vehicle");
  expect(res.body.defaultDiscountServiceTypes).not.toContain("Breakdown Vehicle");
});

test("re-running the seed no longer undoes admin edits (unless --overwrite)", async () => {
  const plus = await SubscriptionPlan.findOne({ code: "plus" });
  await patchPlan(plus._id, { discountPercent: 25 });

  await seedMembershipPlans(SubscriptionPlan);
  expect((await SubscriptionPlan.findById(plus._id)).discountPercent).toBe(25);

  await seedMembershipPlans(SubscriptionPlan, { overwrite: true });
  const reset = DEFAULT_PLANS.find((p) => p.code === "plus").discountPercent;
  expect((await SubscriptionPlan.findById(plus._id)).discountPercent).toBe(reset);
});
