/**
 * Scenario 45: a job created by dispatch with no technician is `pending`.
 * It must show in the customer session (so they don't raise a second SOS),
 * while a pending job for a slot days away stays out of it.
 */
const request = require("supertest");
const { Job } = require("../../clicks-shared/models");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const { seedCustomer, seedCustomerJob } = require("../helpers/seed");
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

async function pendingJob(customer, dateTime = new Date()) {
  const job = await seedCustomerJob({ customer, jobStatus: "pending" });
  job.assignedTechnician = null;
  job.dateTime = dateTime;
  await job.save();
  return job;
}

test("pending job is the live job in the session and in /customer/active", async () => {
  const customer = await seedCustomer();
  const job = await pendingJob(customer);

  const session = await request(techApp)
    .get("/api/jobs/customer/session")
    .set(bearer(customerToken(customer._id)));
  expect(session.status).toBe(200);
  expect(session.body.session_kind).toBe("pending");
  expect(String(session.body.live_job._id)).toBe(String(job._id));
  expect(session.body.has_active_session).toBe(true);

  const active = await request(techApp)
    .get("/api/jobs/customer/active")
    .set(bearer(customerToken(customer._id)));
  expect(active.body.has_active_job).toBe(true);
  expect(String(active.body.active_job._id)).toBe(String(job._id));
});

test("pending job blocks a second immediate booking", async () => {
  const customer = await seedCustomer();
  await pendingJob(customer);
  const res = await request(techApp)
    .post("/api/service-requests")
    .set(bearer(customerToken(customer._id)))
    .send({
      service_type: "Battery Change",
      timing: "immediate",
      latitude: 25.2854,
      longitude: 51.531,
      skip_vehicle: true,
    });
  expect(res.status).toBe(409);
  expect(res.body.code).toBe("LIVE_JOB_ACTIVE");
});

test("a pending job for a slot days away is not live yet", async () => {
  const customer = await seedCustomer();
  await pendingJob(customer, new Date(Date.now() + 3 * 24 * 60 * 60 * 1000));

  const session = await request(techApp)
    .get("/api/jobs/customer/session")
    .set(bearer(customerToken(customer._id)));
  expect(session.body.live_job).toBeNull();
  expect(session.body.session_kind).toBeNull();

  const active = await request(techApp)
    .get("/api/jobs/customer/active")
    .set(bearer(customerToken(customer._id)));
  expect(active.body.has_active_job).toBe(false);
});

test("pending job cancelled by the customer is free and leaves the session", async () => {
  const customer = await seedCustomer();
  const job = await pendingJob(customer);
  const res = await request(techApp)
    .post(`/api/jobs/${job._id}/cancel-customer`)
    .set(bearer(customerToken(customer._id)))
    .send({ reason: "found_help" });
  expect(res.status).toBe(200);
  expect(res.body.cancel_fee_due).toBe(false);
  expect((await Job.findById(job._id)).job_status).toBe("cancelled");

  const session = await request(techApp)
    .get("/api/jobs/customer/session")
    .set(bearer(customerToken(customer._id)));
  expect(session.body.live_job).toBeNull();
});
