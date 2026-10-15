const request = require("supertest");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const { technicianToken, bearer } = require("../helpers/tokens");
const {
  seedArrivedJob,
  seedCustomerJob,
  seedInProgressCompletableJob,
  seedTechnician,
  farTechCoords,
  nearTechCoords,
} = require("../helpers/seed");

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

describe("Job lifecycle + proximity gate", () => {
  test("starting beyond JOB_START_MAX_METERS returns 400 with distanceMeters", async () => {
    const tech = await seedTechnician();
    const job = await seedArrivedJob({ technician: tech });
    const token = technicianToken(tech._id);

    const res = await request(techApp)
      .post(`/api/jobs/${job._id}/start`)
      .set(bearer(token))
      .send(farTechCoords());

    expect(res.status).toBe(400);
    expect(res.body.distanceMeters).toBeGreaterThan(200);
    expect(res.body.error).toMatch(/within 200m/i);
  });

  test("starting within range succeeds", async () => {
    const tech = await seedTechnician();
    const job = await seedArrivedJob({ technician: tech });
    const token = technicianToken(tech._id);

    const res = await request(techApp)
      .post(`/api/jobs/${job._id}/start`)
      .set(bearer(token))
      .send(nearTechCoords());

    expect(res.status).toBe(200);
    expect(res.body.job_status).toBe("in_progress");
    expect(res.body.distanceMeters).toBeLessThanOrEqual(200);
  });

  test("completion requires payment_status paid and a signature", async () => {
    const tech = await seedTechnician();
    const job = await seedArrivedJob({ technician: tech });
    const token = technicianToken(tech._id);

    await request(techApp)
      .post(`/api/jobs/${job._id}/start`)
      .set(bearer(token))
      .send(nearTechCoords());

    const unpaidRes = await request(techApp)
      .post(`/api/jobs/${job._id}/complete`)
      .set(bearer(token));
    expect(unpaidRes.status).toBe(400);
    expect(unpaidRes.body.error).toMatch(/payment/i);

    await request(techApp)
      .post(`/api/jobs/${job._id}/payment`)
      .set(bearer(token))
      .send({ payment_method: "cash" });

    const noSigRes = await request(techApp)
      .post(`/api/jobs/${job._id}/complete`)
      .set(bearer(token));
    expect(noSigRes.status).toBe(400);
    expect(noSigRes.body.error).toMatch(/signature/i);
  });

  test("completion succeeds for technician with legacy expertise values", async () => {
    const tech = await seedTechnician({
      expertise: [
        "Jump start",
        "Flat tire",
        "Fuel delivery",
        "Lockout",
        "Battery replacement",
        "Accident assistance",
      ],
    });
    const job = await seedInProgressCompletableJob({ technician: tech });
    const token = technicianToken(tech._id);

    const res = await request(techApp)
      .post(`/api/jobs/${job._id}/complete`)
      .set(bearer(token))
      .send({ job_reference: "LEGACY-EXPERTISE-001" });

    expect(res.status).toBe(200);
    expect(res.body.job_status).toBe("completed");
  });

  test("en_route notifies admin so dispatch can see the status live", async () => {
    const tech = await seedTechnician();
    const job = await seedCustomerJob({ technician: tech, jobStatus: "accepted" });
    const token = technicianToken(tech._id);
    const seen = [];
    techApp.set("notifyAdminJobStatus", (payload) => {
      seen.push(payload);
    });

    const res = await request(techApp)
      .patch(`/api/jobs/${job._id}/status`)
      .set(bearer(token))
      .send({ job_status: "en_route" });

    expect(res.status).toBe(200);
    expect(res.body.job_status).toBe("en_route");
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual(
      expect.objectContaining({
        job_id: String(job._id),
        status: "en_route",
        technician_id: String(tech._id),
      })
    );
    expect(seen[0].en_route_at).toBeTruthy();
  });
});
