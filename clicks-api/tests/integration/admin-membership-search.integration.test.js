/**
 * Admin grant/search: look up customer garage cars by plate or phone,
 * and find memberships without needing a Mongo id.
 */
const request = require("supertest");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const { seedCustomer, seedCustomerVehicle, seedAdmin } = require("../helpers/seed");
const { adminToken, bearer } = require("../helpers/tokens");
const { SubscriptionPlan } = require("../../clicks-shared/models");
const { seedMembershipPlans } = require("../../clicks-shared/services/membershipPlans");

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

async function grant(vehicle) {
  const plan = await SubscriptionPlan.findOne({ code: "plus" });
  return request(adminApp)
    .post("/api/customer-subscriptions")
    .set(superAdmin())
    .send({
      customer_vehicle_id: vehicle._id.toString(),
      plan_id: plan._id.toString(),
      interval: "month",
      reason: "Goodwill",
    });
}

test("search garage cars by plate and by customer phone", async () => {
  const customer = await seedCustomer({
    phone_number: "+97450011111",
    first_name: "Layla",
    last_name: "Hassan",
  });
  const vehicle = await seedCustomerVehicle(customer, { plate_number: "ABC123" });

  const byPlate = await request(adminApp)
    .get("/api/customer-vehicles")
    .query({ search: "ABC123" })
    .set(superAdmin());
  expect(byPlate.status).toBe(200);
  expect(byPlate.body.vehicles).toHaveLength(1);
  expect(byPlate.body.vehicles[0]).toMatchObject({
    id: vehicle._id.toString(),
    plate: "ABC123",
    customer: { phone: "+97450011111", name: "Layla Hassan" },
  });

  const byPhone = await request(adminApp)
    .get("/api/customer-vehicles")
    .query({ search: "50011111" })
    .set(superAdmin());
  expect(byPhone.status).toBe(200);
  expect(byPhone.body.vehicles.map((v) => v.id)).toContain(vehicle._id.toString());
});

test("lists garage cars for one customer", async () => {
  const customer = await seedCustomer();
  const other = await seedCustomer();
  const mine = await seedCustomerVehicle(customer, { plate_number: "MINE1" });
  await seedCustomerVehicle(other, { plate_number: "OTHER1" });

  const res = await request(adminApp)
    .get(`/api/customers/${customer._id}/vehicles`)
    .set(superAdmin());
  expect(res.status).toBe(200);
  expect(res.body.vehicles).toHaveLength(1);
  expect(res.body.vehicles[0].id).toBe(mine._id.toString());
});

test("membership list search matches plate, phone and plan name", async () => {
  const customer = await seedCustomer({
    phone_number: "+97450022222",
    first_name: "Omar",
  });
  const vehicle = await seedCustomerVehicle(customer, { plate_number: "PLATE9" });
  const granted = await grant(vehicle);
  expect(granted.status).toBe(201);

  const byPlate = await request(adminApp)
    .get("/api/customer-subscriptions")
    .query({ search: "PLATE9" })
    .set(superAdmin());
  expect(byPlate.status).toBe(200);
  expect(byPlate.body.subscriptions).toHaveLength(1);

  const byPhone = await request(adminApp)
    .get("/api/customer-subscriptions")
    .query({ search: "50022222" })
    .set(superAdmin());
  expect(byPhone.status).toBe(200);
  expect(byPhone.body.subscriptions).toHaveLength(1);

  const byPlan = await request(adminApp)
    .get("/api/customer-subscriptions")
    .query({ search: "Plus" })
    .set(superAdmin());
  expect(byPlan.status).toBe(200);
  expect(byPlan.body.subscriptions).toHaveLength(1);

  const byCustomer = await request(adminApp)
    .get("/api/customer-subscriptions")
    .query({ customer_id: customer._id.toString() })
    .set(superAdmin());
  expect(byCustomer.status).toBe(200);
  expect(byCustomer.body.subscriptions).toHaveLength(1);
});

test("ops roles cannot search customer vehicles", async () => {
  await seedAdmin({ _id: "507f1f77bcf86cd799439022", role: "Job Dispatcher" });
  const res = await request(adminApp)
    .get("/api/customer-vehicles")
    .query({ search: "ABC" })
    .set(bearer(adminToken("Job Dispatcher", "507f1f77bcf86cd799439022")));
  expect(res.status).toBe(403);
});
