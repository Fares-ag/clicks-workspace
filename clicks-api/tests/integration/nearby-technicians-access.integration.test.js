/**
 * Privacy (S-tech): customers could list every online technician's name,
 * phone and live coordinates. Customers now get a count and a rounded
 * distance only; coordinates are required and the radius is capped.
 */
const request = require("supertest");
const { Technician } = require("../../clicks-shared/models");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const { seedCustomer, seedTechnician, JOB_LAT, JOB_LNG } = require("../helpers/seed");
const { customerToken, technicianToken, bearer } = require("../helpers/tokens");

let techApp;

beforeAll(async () => {
  await connectTestDb();
  await Technician.init();
  ({ app: techApp } = require("../../clicks-customer-tech-api/src/createApp").createTechApp());
});

afterAll(async () => {
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearCollections();
});

let seq = 0;
async function onlineTechAt(lat, lng, overrides = {}) {
  seq += 1;
  return seedTechnician({
    phone: `+9745558${String(seq).padStart(4, "0")}`,
    email: `nearby-${Date.now()}-${seq}@test.local`,
    currentStatus: "Online",
    currentLocation: { type: "Point", coordinates: [lng, lat] },
    lastLocationAt: new Date(),
    ...overrides,
  });
}

test("customer gets only a count and a rounded nearest distance", async () => {
  await onlineTechAt(JOB_LAT + 0.01, JOB_LNG);
  await onlineTechAt(JOB_LAT + 0.02, JOB_LNG);
  const customer = await seedCustomer();

  const res = await request(techApp)
    .get("/api/jobs/technicians/nearby")
    .query({ latitude: JOB_LAT, longitude: JOB_LNG })
    .set(bearer(customerToken(customer._id)));

  expect(res.status).toBe(200);
  expect(res.body.count).toBe(2);
  expect(typeof res.body.nearest_km).toBe("number");
  expect(res.body.nearest_km).toBeGreaterThan(0);
  expect(res.body.technicians).toBeUndefined();
  const raw = JSON.stringify(res.body);
  expect(raw).not.toMatch(/\+974/);
  expect(raw).not.toMatch(/coordinates/);
});

test("no coordinates -> 400 (no fleet-wide fallback)", async () => {
  await onlineTechAt(JOB_LAT, JOB_LNG);
  const customer = await seedCustomer();
  const res = await request(techApp)
    .get("/api/jobs/technicians/nearby")
    .set(bearer(customerToken(customer._id)));
  expect(res.status).toBe(400);
  expect(res.body.code).toBe("NEARBY_LOCATION_REQUIRED");
});

test("radius is capped and technicians do not get phone numbers", async () => {
  const me = await onlineTechAt(JOB_LAT, JOB_LNG);
  await onlineTechAt(JOB_LAT + 0.01, JOB_LNG);
  // ~110 km away: outside the 50 km cap even if the client asks for 500 km.
  await onlineTechAt(JOB_LAT + 1, JOB_LNG);

  const res = await request(techApp)
    .get("/api/jobs/technicians/nearby")
    .query({ latitude: JOB_LAT, longitude: JOB_LNG, maxDistanceKm: 500 })
    .set(bearer(technicianToken(me._id)));
  expect(res.status).toBe(200);
  expect(res.body.radius_km).toBe(50);
  expect(res.body.technicians).toHaveLength(2);
  for (const t of res.body.technicians) {
    expect(t.phone).toBeUndefined();
  }
});

test("unauthenticated callers are refused", async () => {
  const res = await request(techApp)
    .get("/api/jobs/technicians/nearby")
    .query({ latitude: JOB_LAT, longitude: JOB_LNG });
  expect(res.status).toBe(401);
});
