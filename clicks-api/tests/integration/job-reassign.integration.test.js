const request = require("supertest");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const { adminToken, bearer } = require("../helpers/tokens");
const { seedTechnician, seedSource, seedCustomerJob, seedAdmin } = require("../helpers/seed");
const Job = require("../../clicks-shared/models/Job");

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
  await seedAdmin();
});

test("POST /api/jobs/:id/reassign moves job to new technician", async () => {
  const source = await seedSource();
  const techA = await seedTechnician({ firstName: "Alpha", lastName: "Tech" });
  const techB = await seedTechnician({ firstName: "Beta", lastName: "Tech" });
  let job = await seedCustomerJob({
    source,
    technician: techA,
    jobStatus: "accepted",
  });
  job.accepted_at = new Date();
  await job.save();

  const token = adminToken("Super Admin");
  const res = await request(adminApp)
    .post(`/api/jobs/${job._id}/reassign`)
    .set(bearer(token))
    .send({
      technician_id: String(techB._id),
      reason: "technician_unavailable",
      reason_note: "End of shift",
    });

  expect(res.status).toBe(200);
  expect(String(res.body.job.assignedTechnician._id)).toBe(String(techB._id));
  expect(res.body.job.job_status).toBe("assigned");
  expect(res.body.job.accepted_at).toBeFalsy();

  const stored = await Job.findById(job._id).lean();
  expect(String(stored.assignedTechnician)).toBe(String(techB._id));
  expect(stored.reassignment_history).toHaveLength(1);
  expect(stored.reassignment_history[0].reason).toBe("technician_unavailable");
});

test("reassign rejects in_progress jobs", async () => {
  const source = await seedSource();
  const techA = await seedTechnician();
  const techB = await seedTechnician({ phone: "+97455500002" });
  let job = await seedCustomerJob({
    source,
    technician: techA,
    jobStatus: "in_progress",
  });
  job.started_at = new Date();
  await job.save();

  const token = adminToken("Super Admin");
  const res = await request(adminApp)
    .post(`/api/jobs/${job._id}/reassign`)
    .set(bearer(token))
    .send({
      technician_id: String(techB._id),
      reason: "dispatch_error",
    });

  expect(res.status).toBe(409);
});

test("PUT /api/jobs/:id blocks silent technician swap", async () => {
  const source = await seedSource();
  const techA = await seedTechnician();
  const techB = await seedTechnician({ phone: "+97455500003" });
  const job = await seedCustomerJob({
    source,
    technician: techA,
    jobStatus: "assigned",
  });

  const token = adminToken("Super Admin");
  const res = await request(adminApp)
    .put(`/api/jobs/${job._id}`)
    .set(bearer(token))
    .send({ assignedTechnician: String(techB._id) });

  expect(res.status).toBe(400);
  expect(res.body.message).toMatch(/reassign/i);
});
