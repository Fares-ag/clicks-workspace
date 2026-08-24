const request = require("supertest");
const {
  Job,
  TechnicianEarnings,
  TechnicianEarningEntry,
  Receipt,
} = require("../../clicks-shared/models");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const { technicianToken, bearer } = require("../helpers/tokens");
const { seedInProgressCompletableJob, seedTechnician } = require("../helpers/seed");

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

async function completeJob(jobId, token) {
  return request(techApp)
    .post(`/api/jobs/${jobId}/complete`)
    .set(bearer(token))
    .send({ job_reference: "QA-JOB-0001" });
}

describe("Technician earnings idempotency", () => {
  test("sequential double-complete credits exactly once", async () => {
    const tech = await seedTechnician();
    const job = await seedInProgressCompletableJob({ technician: tech, price: 100 });
    const token = technicianToken(tech._id);

    const first = await completeJob(job._id, token);
    expect(first.status).toBe(200);

    const second = await completeJob(job._id, token);
    expect(second.status).toBe(200);
    expect(second.body.message).toMatch(/already completed/i);

    const entries = await TechnicianEarningEntry.find({ job_id: job._id });
    expect(entries).toHaveLength(1);
    expect(entries[0].amount).toBe(100);

    const totals = await TechnicianEarnings.findOne({ technician_id: tech._id });
    expect(totals.total_earned).toBe(100);
    expect(totals.performance.total_completed_jobs).toBe(1);
  });

  test("concurrent double-complete credits exactly once", async () => {
    const tech = await seedTechnician();
    const job = await seedInProgressCompletableJob({ technician: tech, price: 250 });
    const token = technicianToken(tech._id);

    const [a, b] = await Promise.all([
      completeJob(job._id, token),
      completeJob(job._id, token),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 200]);

    const entries = await TechnicianEarningEntry.find({ job_id: job._id });
    expect(entries).toHaveLength(1);
    expect(entries[0].amount).toBe(250);

    const totals = await TechnicianEarnings.findOne({ technician_id: tech._id });
    expect(totals.total_earned).toBe(250);
    expect(totals.performance.total_completed_jobs).toBe(1);
  });

  test("transaction abort on receipt failure leaves job in_progress; retry credits once", async () => {
    const tech = await seedTechnician();
    const job = await seedInProgressCompletableJob({ technician: tech, price: 150 });
    const token = technicianToken(tech._id);

    const createSpy = jest
      .spyOn(Receipt, "create")
      .mockRejectedValueOnce(new Error("simulated receipt insert failure"));

    const failed = await completeJob(job._id, token);
    expect(failed.status).toBe(500);

    createSpy.mockRestore();

    const jobAfterFail = await Job.findById(job._id);
    expect(jobAfterFail.job_status).toBe("in_progress");
    expect(await TechnicianEarningEntry.countDocuments({ job_id: job._id })).toBe(0);
    expect(await TechnicianEarnings.countDocuments({ technician_id: tech._id })).toBe(0);
    expect(await Receipt.countDocuments({ job_id: job._id })).toBe(0);

    const retry = await completeJob(job._id, token);
    expect(retry.status).toBe(200);
    expect(retry.body.job_status).toBe("completed");

    const entries = await TechnicianEarningEntry.find({ job_id: job._id });
    expect(entries).toHaveLength(1);
    expect(entries[0].amount).toBe(150);

    const totals = await TechnicianEarnings.findOne({ technician_id: tech._id });
    expect(totals.total_earned).toBe(150);
    expect(totals.performance.total_completed_jobs).toBe(1);
  });
});
