/**
 * Dispatcher queue: claim-next, FIFO list, open counts, ops readiness.
 */
const request = require("supertest");
const { SOSRequest } = require("../../clicks-shared/models");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const { seedAdmin, seedCustomer, JOB_LAT, JOB_LNG } = require("../helpers/seed");
const { adminToken, bearer } = require("../helpers/tokens");
const { clearCountCache } = require("../../clicks-shared/utils/cachedCount");
const { clearOpsSettingsCache } = require("../../clicks-shared/services/opsSettings");

const DISPATCHER_A = "507f1f77bcf86cd799439061";
const DISPATCHER_B = "507f1f77bcf86cd799439062";
let adminApp;

async function pendingSos(customer, extra = {}) {
  return SOSRequest.create({
    customer_id: customer._id,
    location: { type: "Point", coordinates: [JOB_LNG, JOB_LAT] },
    status: "pending",
    ...extra,
  });
}

beforeAll(async () => {
  await connectTestDb();
  adminApp = require("../../clicks-admin-api/src/createApp").createAdminApp();
});

afterAll(async () => {
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearCollections();
  clearCountCache();
  clearOpsSettingsCache();
  delete process.env.ONCALL_PHONE;
  delete process.env.SUPPORT_PHONE;
  await seedAdmin({ _id: DISPATCHER_A, role: "Job Dispatcher" });
  await seedAdmin({ _id: DISPATCHER_B, role: "Job Dispatcher" });
});

function auth(id = DISPATCHER_A) {
  return bearer(adminToken("Job Dispatcher", id));
}

test("claim-next takes the oldest unclaimed pending SOS", async () => {
  const olderCustomer = await seedCustomer();
  const newerCustomer = await seedCustomer();
  const older = await pendingSos(olderCustomer, {
    createdAt: new Date("2026-01-01T10:00:00.000Z"),
  });
  await pendingSos(newerCustomer, {
    createdAt: new Date("2026-01-01T11:00:00.000Z"),
  });

  const res = await request(adminApp).post("/api/sos/claim-next").set(auth());
  expect(res.status).toBe(200);
  expect(res.body.request.sos_id).toBe(String(older._id));
  expect(res.body.request.status).toBe("in_call");
  const stored = await SOSRequest.findById(older._id).lean();
  expect(stored.status).toBe("in_call");
  expect(String(stored.claimed_by)).toBe(DISPATCHER_A);
});

test("two concurrent claim-next calls get two different SOS", async () => {
  const c1 = await seedCustomer();
  const c2 = await seedCustomer();
  await pendingSos(c1, { createdAt: new Date("2026-01-01T10:00:00.000Z") });
  await pendingSos(c2, { createdAt: new Date("2026-01-01T10:01:00.000Z") });

  const [a, b] = await Promise.all([
    request(adminApp).post("/api/sos/claim-next").set(auth(DISPATCHER_A)),
    request(adminApp).post("/api/sos/claim-next").set(auth(DISPATCHER_B)),
  ]);
  expect(a.status).toBe(200);
  expect(b.status).toBe(200);
  expect(a.body.request.sos_id).not.toBe(b.body.request.sos_id);
  const claimed = await SOSRequest.find({ status: "in_call" }).lean();
  expect(claimed).toHaveLength(2);
});

test("claim-next on an empty queue returns SOS_QUEUE_EMPTY", async () => {
  const res = await request(adminApp).post("/api/sos/claim-next").set(auth());
  expect(res.status).toBe(409);
  expect(res.body.code).toBe("SOS_QUEUE_EMPTY");
});

test("claim-next skips in_call and already-claimed pending rows", async () => {
  const held = await seedCustomer();
  const open = await seedCustomer();
  await pendingSos(held, {
    status: "in_call",
    claimed_by: DISPATCHER_B,
    claimed_at: new Date(),
    createdAt: new Date("2026-01-01T09:00:00.000Z"),
  });
  const pending = await pendingSos(open, {
    createdAt: new Date("2026-01-01T12:00:00.000Z"),
  });

  const res = await request(adminApp).post("/api/sos/claim-next").set(auth());
  expect(res.status).toBe(200);
  expect(res.body.request.sos_id).toBe(String(pending._id));
});

test("GET /sos default sort is newest; sort=oldest is FIFO", async () => {
  const c1 = await seedCustomer();
  const c2 = await seedCustomer();
  const older = await pendingSos(c1, {
    createdAt: new Date("2026-01-01T10:00:00.000Z"),
  });
  const newer = await pendingSos(c2, {
    createdAt: new Date("2026-01-01T11:00:00.000Z"),
  });

  const newest = await request(adminApp)
    .get("/api/sos?status=pending")
    .set(auth());
  expect(newest.status).toBe(200);
  expect(newest.body.requests.map((r) => r.sos_id)).toEqual([
    String(newer._id),
    String(older._id),
  ]);

  const oldest = await request(adminApp)
    .get("/api/sos?status=pending&sort=oldest")
    .set(auth());
  expect(oldest.body.requests.map((r) => r.sos_id)).toEqual([
    String(older._id),
    String(newer._id),
  ]);
});

test("GET /sos returns queue counts and ops readiness without phone numbers", async () => {
  const pendingCustomer = await seedCustomer();
  const inCallCustomer = await seedCustomer();
  await pendingSos(pendingCustomer);
  await pendingSos(inCallCustomer, {
    status: "in_call",
    claimed_by: DISPATCHER_A,
    claimed_at: new Date(),
  });

  const empty = await request(adminApp).get("/api/sos").set(auth());
  expect(empty.status).toBe(200);
  expect(empty.body.queue).toEqual({ pending: 1, in_call: 1 });
  expect(empty.body.ops).toEqual({
    oncall_configured: false,
    support_configured: false,
  });
  expect(JSON.stringify(empty.body.ops)).not.toMatch(/\+974/);

  process.env.ONCALL_PHONE = "+97455500011";
  process.env.SUPPORT_PHONE = "+97444001234";
  clearOpsSettingsCache();

  const ready = await request(adminApp).get("/api/sos").set(auth());
  expect(ready.body.ops).toEqual({
    oncall_configured: true,
    support_configured: true,
  });
  expect(JSON.stringify(ready.body.ops)).not.toMatch(/\+974/);
});

test("POST /sos/:id/claim still 409s when another dispatcher holds it", async () => {
  const customer = await seedCustomer();
  const sos = await pendingSos(customer);
  const first = await request(adminApp)
    .post(`/api/sos/${sos._id}/claim`)
    .set(auth(DISPATCHER_A));
  expect(first.status).toBe(200);

  const second = await request(adminApp)
    .post(`/api/sos/${sos._id}/claim`)
    .set(auth(DISPATCHER_B));
  expect(second.status).toBe(409);
  expect(second.body.code).toBe("SOS_ALREADY_CLAIMED");
});
