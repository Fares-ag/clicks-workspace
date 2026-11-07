/**
 * Scenarios 42-44: two dispatchers (or a double-click on Save) creating jobs
 * for the same SOS must produce exactly one job; the loser gets a 409.
 */
const request = require("supertest");
const { Job, SOSRequest } = require("../../clicks-shared/models");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const { seedAdmin, seedCustomer, seedSource, JOB_LAT, JOB_LNG } = require("../helpers/seed");
const { adminToken, bearer } = require("../helpers/tokens");

let adminApp;
const ADMIN_A = "507f1f77bcf86cd799439021";
const ADMIN_B = "507f1f77bcf86cd799439022";

beforeAll(async () => {
  await connectTestDb();
  await SOSRequest.init();
  adminApp = require("../../clicks-admin-api/src/createApp").createAdminApp();
});

afterAll(async () => {
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearCollections();
  await seedAdmin({ _id: ADMIN_A, role: "Job Dispatcher" });
  await seedAdmin({ _id: ADMIN_B, role: "Job Dispatcher" });
});

function jobBody(customer, source, sosId, overrides = {}) {
  return {
    customer_id: String(customer._id),
    clientName: "Race Customer",
    clientMobileNumber: customer.phone_number,
    issue: "Flat tyre",
    location: "Somewhere typed by dispatch",
    dateTime: new Date().toISOString(),
    jobType: "Flat tire",
    source: String(source._id),
    sos_request_id: String(sosId),
    ...overrides,
  };
}

test("two parallel job creates for one SOS -> exactly one job, second 409", async () => {
  const customer = await seedCustomer();
  const source = await seedSource();
  const sos = await SOSRequest.create({
    customer_id: customer._id,
    location: { type: "Point", coordinates: [JOB_LNG, JOB_LAT] },
    status: "in_call",
    claimed_by: ADMIN_A,
    claimed_at: new Date(),
  });

  const token = adminToken("Job Dispatcher", ADMIN_A);
  const [r1, r2] = await Promise.all([
    request(adminApp).post("/api/jobs").set(bearer(token)).send(jobBody(customer, source, sos._id)),
    request(adminApp).post("/api/jobs").set(bearer(token)).send(jobBody(customer, source, sos._id)),
  ]);

  const statuses = [r1.status, r2.status].sort();
  expect(statuses).toEqual([201, 409]);
  const loser = r1.status === 409 ? r1 : r2;
  expect(loser.body.code).toBe("SOS_ALREADY_HANDLED");

  const jobs = await Job.find({ sos_request_id: sos._id });
  expect(jobs).toHaveLength(1);
  const stored = await SOSRequest.findById(sos._id);
  expect(stored.status).toBe("accepted");
  expect(String(stored.job_id)).toBe(String(jobs[0]._id));
  expect(stored.outcome).toBe("job_created");
});

test("a dispatcher who does not hold the claim cannot create the job", async () => {
  const customer = await seedCustomer();
  const source = await seedSource();
  const sos = await SOSRequest.create({
    customer_id: customer._id,
    location: { type: "Point", coordinates: [JOB_LNG, JOB_LAT] },
    status: "in_call",
    claimed_by: ADMIN_A,
    claimed_at: new Date(),
  });

  const res = await request(adminApp)
    .post("/api/jobs")
    .set(bearer(adminToken("Job Dispatcher", ADMIN_B)))
    .send(jobBody(customer, source, sos._id));

  expect(res.status).toBe(409);
  expect(res.body.code).toBe("SOS_CLAIMED_BY_OTHER");
  expect(await Job.countDocuments({})).toBe(0);
  expect((await SOSRequest.findById(sos._id)).status).toBe("in_call");
});

test("job copies the SOS GPS pin; typed address is only a label (scenario 34)", async () => {
  const customer = await seedCustomer();
  const source = await seedSource();
  const pinLat = 25.3012;
  const pinLng = 51.4987;
  const sos = await SOSRequest.create({
    customer_id: customer._id,
    location: { type: "Point", coordinates: [pinLng, pinLat] },
    status: "pending",
  });

  const res = await request(adminApp)
    .post("/api/jobs")
    .set(bearer(adminToken("Job Dispatcher", ADMIN_A)))
    .send(jobBody(customer, source, sos._id, { location: "Near the big roundabout" }));

  expect(res.status).toBe(201);
  const job = await Job.findById(res.body.job._id);
  expect(job.locationCoordinates.coordinates).toEqual([pinLng, pinLat]);
  expect(job.location_label).toBe("Near the big roundabout");
  // An unclaimed pending SOS converted directly counts as claimed by the creator.
  const stored = await SOSRequest.findById(sos._id);
  expect(String(stored.claimed_by)).toBe(ADMIN_A);
  expect(String(stored.job_id)).toBe(String(job._id));
});

test("a cancelled SOS cannot be turned into a job", async () => {
  const customer = await seedCustomer();
  const source = await seedSource();
  const sos = await SOSRequest.create({
    customer_id: customer._id,
    location: { type: "Point", coordinates: [JOB_LNG, JOB_LAT] },
    status: "cancelled",
  });

  const res = await request(adminApp)
    .post("/api/jobs")
    .set(bearer(adminToken("Job Dispatcher", ADMIN_A)))
    .send(jobBody(customer, source, sos._id));

  expect(res.status).toBe(409);
  expect(res.body.code).toBe("SOS_CANCELLED");
  expect(await Job.countDocuments({})).toBe(0);
});
