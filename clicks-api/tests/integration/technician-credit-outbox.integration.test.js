const request = require("supertest");
const {
  Job,
  TechnicianEarnings,
  TechnicianEarningEntry,
  OutboxEvent,
} = require("../../clicks-shared/models");
const TechnicianEarningEntryModel = require("../../clicks-shared/models/TechnicianEarningEntry");
const {
  OUTBOX_TYPES,
  dispatchTechnicianCredit,
} = require("../../clicks-shared/services/outboxWorker");
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

describe("Technician credit outbox recovery", () => {
  test("transient credit failure inside transaction rolls back; retry completes without outbox", async () => {
    const tech = await seedTechnician();
    const job = await seedInProgressCompletableJob({ technician: tech, price: 175 });
    const token = technicianToken(tech._id);

    const createSpy = jest
      .spyOn(TechnicianEarningEntryModel, "create")
      .mockRejectedValueOnce(new Error("simulated transient Atlas blip"));

    const res = await request(techApp)
      .post(`/api/jobs/${job._id}/complete`)
      .set(bearer(token))
      .send({ job_reference: "QA-JOB-0001" });

    expect(res.status).toBe(500);

    createSpy.mockRestore();

    const jobAfterFail = await Job.findById(job._id);
    expect(jobAfterFail.job_status).toBe("in_progress");
    expect(await TechnicianEarningEntry.countDocuments({ job_id: job._id })).toBe(0);
    expect(await TechnicianEarnings.countDocuments({ technician_id: tech._id })).toBe(0);

    const outbox = await OutboxEvent.findOne({
      type: OUTBOX_TYPES.TECHNICIAN_CREDIT,
      "payload.job_id": job._id.toString(),
    });
    expect(outbox).toBeNull();

    const retry = await request(techApp)
      .post(`/api/jobs/${job._id}/complete`)
      .set(bearer(token))
      .send({ job_reference: "QA-JOB-0001" });

    expect(retry.status).toBe(200);
    expect(retry.body.job_status).toBe("completed");

    const entries = await TechnicianEarningEntry.find({ job_id: job._id });
    expect(entries).toHaveLength(1);
    expect(entries[0].amount).toBe(175);

    const totals = await TechnicianEarnings.findOne({ technician_id: tech._id });
    expect(totals.total_earned).toBe(175);
    expect(totals.performance.total_completed_jobs).toBe(1);
  });

  test("standalone fallback enqueues outbox when credit fails after job flip", async () => {
    const tech = await seedTechnician();
    const job = await seedInProgressCompletableJob({ technician: tech, price: 175 });
    const token = technicianToken(tech._id);

    const replicaErr = Object.assign(
      new Error("Transaction numbers are only allowed on a replica set"),
      { code: 20 }
    );
    jest.spyOn(Job.db, "startSession").mockResolvedValueOnce({
      withTransaction: jest.fn().mockRejectedValue(replicaErr),
      endSession: jest.fn().mockResolvedValue(undefined),
    });

    const createSpy = jest
      .spyOn(TechnicianEarningEntryModel, "create")
      .mockRejectedValueOnce(new Error("simulated transient Atlas blip"));

    const res = await request(techApp)
      .post(`/api/jobs/${job._id}/complete`)
      .set(bearer(token))
      .send({ job_reference: "QA-JOB-0001" });

    expect(res.status).toBe(200);
    expect(res.body.job_status).toBe("completed");

    createSpy.mockRestore();
    Job.db.startSession.mockRestore();

    expect(await TechnicianEarningEntry.countDocuments({ job_id: job._id })).toBe(0);
    expect(await TechnicianEarnings.countDocuments({ technician_id: tech._id })).toBe(0);

    const outbox = await OutboxEvent.findOne({
      type: OUTBOX_TYPES.TECHNICIAN_CREDIT,
      "payload.job_id": job._id.toString(),
      status: "pending",
    });
    expect(outbox).not.toBeNull();

    await dispatchTechnicianCredit(outbox.payload);

    const entries = await TechnicianEarningEntry.find({ job_id: job._id });
    expect(entries).toHaveLength(1);
    expect(entries[0].amount).toBe(175);

    const totals = await TechnicianEarnings.findOne({ technician_id: tech._id });
    expect(totals.total_earned).toBe(175);
    expect(totals.performance.total_completed_jobs).toBe(1);

    await dispatchTechnicianCredit(outbox.payload);
    expect(await TechnicianEarningEntry.countDocuments({ job_id: job._id })).toBe(1);
    const totalsAfterRetry = await TechnicianEarnings.findOne({ technician_id: tech._id });
    expect(totalsAfterRetry.total_earned).toBe(175);
  });
});
