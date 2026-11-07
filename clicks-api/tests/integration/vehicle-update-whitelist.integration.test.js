/**
 * QW 24 (scenario 24): PUT /api/vehicles/:id only writes editable fields.
 */
const request = require("supertest");
const { CustomerVehicle } = require("../../clicks-shared/models");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const { seedCustomer, seedCustomerVehicle } = require("../helpers/seed");
const { customerToken, bearer } = require("../helpers/tokens");

let techApp;

beforeAll(async () => {
  await connectTestDb();
  ({ app: techApp } = require("../../clicks-customer-tech-api/src/createApp").createTechApp());
});

afterAll(async () => {
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearCollections();
});

function update(customer, vehicle, body) {
  return request(techApp)
    .put(`/api/vehicles/${vehicle._id}`)
    .set(bearer(customerToken(customer._id)))
    .send(body);
}

test("customer_id in the body is ignored — the car cannot be moved to another account", async () => {
  const owner = await seedCustomer();
  const other = await seedCustomer({ phone_number: "+97455566001", email: "other@test.local" });
  const vehicle = await seedCustomerVehicle(owner);

  const res = await update(owner, vehicle, {
    customer_id: String(other._id),
    vehicle_color: "Red",
    createdAt: "2001-01-01T00:00:00.000Z",
  });
  expect(res.status).toBe(200);
  const after = await CustomerVehicle.findById(vehicle._id);
  expect(String(after.customer_id)).toBe(String(owner._id));
  expect(after.vehicle_color).toBe("Red");
  expect(after.createdAt.getUTCFullYear()).not.toBe(2001);
});

test("editable fields are written", async () => {
  const owner = await seedCustomer();
  const vehicle = await seedCustomerVehicle(owner);
  const res = await update(owner, vehicle, { year: 2020, plate_number: " 123456 ", vin_number: "VIN1" });
  expect(res.status).toBe(200);
  const after = await CustomerVehicle.findById(vehicle._id);
  expect(after.year).toBe(2020);
  expect(after.plate_number).toBe("123456");
  expect(after.vin_number).toBe("VIN1");
});

test("a plate registered on another vehicle is refused with 409", async () => {
  const owner = await seedCustomer();
  const other = await seedCustomer({ phone_number: "+97455566002", email: "other2@test.local" });
  const theirs = await seedCustomerVehicle(other, { plate_number: "777777" });
  const mine = await seedCustomerVehicle(owner);
  const res = await update(owner, mine, { plate_number: theirs.plate_number });
  expect(res.status).toBe(409);
  expect(res.body.code).toBe("PLATE_ALREADY_REGISTERED");
});

test("malformed ids and years are 400, not 500", async () => {
  const owner = await seedCustomer();
  const vehicle = await seedCustomerVehicle(owner);
  expect((await update(owner, vehicle, { vehicle_make: { $ne: null } })).status).toBe(400);
  expect((await update(owner, vehicle, { year: "next year" })).status).toBe(400);
});

test("another customer still cannot edit the vehicle", async () => {
  const owner = await seedCustomer();
  const intruder = await seedCustomer({ phone_number: "+97455566003", email: "x@test.local" });
  const vehicle = await seedCustomerVehicle(owner);
  const res = await update(intruder, vehicle, { vehicle_color: "Blue" });
  expect(res.status).toBe(403);
});
