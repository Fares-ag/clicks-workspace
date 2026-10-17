const request = require("supertest");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const { technicianToken, bearer } = require("../helpers/tokens");
const { seedTechnician, seedCustomerJob } = require("../helpers/seed");
const {
  getCachedPayload,
  clearPayloadCache,
} = require("../../clicks-shared/utils/payloadCache");

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
  clearPayloadCache();
});

afterEach(() => {
  clearPayloadCache();
});

describe("technician session freshness", () => {
  test("session ignores a stale payload-cache entry after accept", async () => {
    const tech = await seedTechnician();
    const token = technicianToken(tech._id);
    const job = await seedCustomerJob({
      technician: tech,
      jobStatus: "assigned",
    });

    const cacheKey = `clicks:tech:payload:session:${tech._id}`;
    await getCachedPayload(cacheKey, 120000, async () => ({
      technician: {
        id: tech._id,
        status: "Online",
        applicationStatus: "Approved",
      },
      active_job: {
        _id: job._id,
        job_status: "assigned",
        clientName: "STALE CACHE",
      },
      active_jobs: [{ _id: job._id, job_status: "assigned" }],
      has_active_job: true,
    }));

    const accept = await request(techApp)
      .post(`/api/technicians/jobs/${job._id}/accept`)
      .set(bearer(token))
      .send({});
    expect(accept.status).toBe(200);

    const session = await request(techApp)
      .get("/api/jobs/technician/session")
      .set(bearer(token));

    expect(session.status).toBe(200);
    expect(session.body.active_job.job_status).toBe("accepted");
    expect(session.body.active_job.clientName).not.toBe("STALE CACHE");
    expect(session.body.active_jobs).toHaveLength(1);
    expect(session.body.active_jobs[0].job_status).toBe("accepted");
  });

  test("session reflects en_route immediately", async () => {
    const tech = await seedTechnician();
    const token = technicianToken(tech._id);
    const job = await seedCustomerJob({
      technician: tech,
      jobStatus: "accepted",
    });

    const enRoute = await request(techApp)
      .patch(`/api/jobs/${job._id}/status`)
      .set(bearer(token))
      .send({ job_status: "en_route" });
    expect(enRoute.status).toBe(200);

    const session = await request(techApp)
      .get("/api/jobs/technician/session")
      .set(bearer(token));

    expect(session.status).toBe(200);
    expect(session.body.active_job.job_status).toBe("en_route");
  });
});
