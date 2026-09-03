const request = require("supertest");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const { technicianToken, adminToken, bearer } = require("../helpers/tokens");
const { seedTechnician, seedSource, seedAdmin } = require("../helpers/seed");
const Job = require("../../clicks-shared/models/Job");

let techApp;
let adminApp;

const JOB_LAT = 25.2854;
const JOB_LNG = 51.531;

function techJobBody(overrides = {}) {
  const suffix = String(Date.now()).slice(-8);
  return {
    clientName: "QA Multi Job",
    clientMobileNumber: suffix,
    countryCode: "+974",
    vehicleMake: "Toyota",
    vehicleModel: "Camry",
    issue: "QA multi-job integration test",
    location: `LatLng(${JOB_LAT}, ${JOB_LNG})`,
    dateTime: new Date().toISOString(),
    jobType: "Flat Tire",
    price: 150,
    ...overrides,
  };
}

async function createAcceptedTechJob(app, token, overrides = {}) {
  const res = await request(app)
    .post("/api/technicians/jobs")
    .set(bearer(token))
    .send(techJobBody(overrides));
  return res;
}

async function advanceToInProgress(app, token, jobId) {
  await request(app)
    .patch(`/api/jobs/${jobId}/status`)
    .set(bearer(token))
    .send({ job_status: "en_route" });
  await request(app)
    .post(`/api/jobs/${jobId}/arrive`)
    .set(bearer(token))
    .send({});
  return request(app)
    .post(`/api/jobs/${jobId}/start`)
    .set(bearer(token))
    .send({});
}

async function adminHoldJob(jobId, reason) {
  const token = adminToken("Super Admin");
  return request(adminApp)
    .post(`/api/jobs/${jobId}/hold`)
    .set(bearer(token))
    .send({ reason });
}

async function adminResumeJob(jobId) {
  const token = adminToken("Super Admin");
  return request(adminApp)
    .post(`/api/jobs/${jobId}/resume`)
    .set(bearer(token))
    .send({});
}

beforeAll(async () => {
  await connectTestDb();
  ({ app: techApp } = require("../../clicks-customer-tech-api/src/createApp").createTechApp());
  adminApp = require("../../clicks-admin-api/src/createApp").createAdminApp();
});

afterAll(async () => {
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearCollections();
  await seedAdmin();
});

describe("Technician multi-job + on-hold QA matrix (API)", () => {
  test("M1: technician can create an accepted job", async () => {
    const tech = await seedTechnician();
    const token = technicianToken(tech._id);

    const first = await createAcceptedTechJob(techApp, token, { clientName: "Job A" });
    expect(first.status).toBe(201);
    expect(first.body.job.job_status).toBe("accepted");
  });

  test("create is blocked while another fulfill-path job is active", async () => {
    const tech = await seedTechnician();
    const token = technicianToken(tech._id);

    const first = await createAcceptedTechJob(techApp, token, { clientName: "Job A" });
    expect(first.status).toBe(201);

    const second = await createAcceptedTechJob(techApp, token, { clientName: "Job B" });
    expect(second.status).toBe(400);
    expect(second.body.error).toMatch(/on hold before creating another/i);
    expect(second.body.blocking_job_id).toBeTruthy();
  });

  test("technician cannot hold or resume (admin-only)", async () => {
    const tech = await seedTechnician();
    const token = technicianToken(tech._id);
    const created = await createAcceptedTechJob(techApp, token);
    const jobId = created.body.job._id;

    const hold = await request(techApp)
      .post(`/api/jobs/${jobId}/hold`)
      .set(bearer(token))
      .send({ reason: "Tech attempt" });
    expect(hold.status).toBe(404);

    await adminHoldJob(jobId, "Admin hold for tech resume test");
    const resume = await request(techApp)
      .post(`/api/jobs/${jobId}/resume`)
      .set(bearer(token))
      .send({});
    expect(resume.status).toBe(404);
  });

  test("create is allowed after admin puts the active job on hold", async () => {
    const tech = await seedTechnician();
    const token = technicianToken(tech._id);

    const first = await createAcceptedTechJob(techApp, token, { clientName: "Job A" });
    const idA = first.body.job._id;

    const hold = await adminHoldJob(idA, "Sent to garage for 2-day maintenance");
    expect(hold.status).toBe(200);
    expect(hold.body.job.job_status).toBe("on_hold");
    expect(hold.body.job.hold_reason).toMatch(/garage/i);
    expect(hold.body.job.status_before_hold).toBe("accepted");
    expect(hold.body.job.held_by).toBe("admin");

    const second = await createAcceptedTechJob(techApp, token, { clientName: "Job B" });
    expect(second.status).toBe(201);
    expect(second.body.job.job_status).toBe("accepted");
  });

  test("admin hold from in_progress; admin resume restores prior status", async () => {
    const tech = await seedTechnician();
    const token = technicianToken(tech._id);
    const created = await createAcceptedTechJob(techApp, token);
    const jobId = created.body.job._id;
    await advanceToInProgress(techApp, token, jobId);

    const hold = await adminHoldJob(jobId, "Waiting on parts");
    expect(hold.status).toBe(200);
    expect(hold.body.job.status_before_hold).toBe("in_progress");

    const session = await request(techApp)
      .get("/api/jobs/technician/session")
      .set(bearer(token));
    expect(session.body.active_jobs.some((j) => j.job_status === "on_hold")).toBe(true);

    const offline = await request(techApp)
      .patch("/api/technicians/status")
      .set(bearer(token))
      .send({ status: "Offline" });
    expect(offline.status).toBe(200);

    const resume = await adminResumeJob(jobId);
    expect(resume.status).toBe(200);
    expect(resume.body.job.job_status).toBe("in_progress");
    const saved = await Job.findById(jobId).lean();
    expect(saved.hold_reason).toMatch(/parts/i);
  });

  test("M5/M6: only one in_progress job; held job does not block starting another after resume+complete", async () => {
    const tech = await seedTechnician();
    const token = technicianToken(tech._id);

    const jobA = await createAcceptedTechJob(techApp, token, { clientName: "In progress A" });
    const idA = jobA.body.job._id;
    await adminHoldJob(idA, "Hold A to create B");

    const jobB = await createAcceptedTechJob(techApp, token, { clientName: "Queued B" });
    const idB = jobB.body.job._id;

    await adminResumeJob(idA);
    const startA = await advanceToInProgress(techApp, token, idA);
    expect(startA.status).toBe(200);
    expect(startA.body.job_status).toBe("in_progress");

    await request(techApp)
      .patch(`/api/jobs/${idB}/status`)
      .set(bearer(token))
      .send({ job_status: "en_route" });
    await request(techApp)
      .post(`/api/jobs/${idB}/arrive`)
      .set(bearer(token))
      .send({});

    const blocked = await request(techApp)
      .post(`/api/jobs/${idB}/start`)
      .set(bearer(token))
      .send({});
    expect(blocked.status).toBe(400);
    expect(blocked.body.error).toMatch(/Finish your current in-progress job/i);
    expect(String(blocked.body.blocking_job_id)).toBe(String(idA));

    await request(techApp)
      .post(`/api/jobs/${idA}/payment`)
      .set(bearer(token))
      .send({ payment_method: "cash" });
    await request(techApp)
      .post(`/api/jobs/${idA}/signature`)
      .set(bearer(token))
      .attach("signature", Buffer.from("fake"), "sign.png");
    const completeA = await request(techApp)
      .post(`/api/jobs/${idA}/complete`)
      .set(bearer(token))
      .send({ notes: "QA M6 complete A", job_reference: "QA-MULTI-A" });
    expect(completeA.status).toBe(200);

    const startB = await request(techApp)
      .post(`/api/jobs/${idB}/start`)
      .set(bearer(token))
      .send({});
    expect(startB.status).toBe(200);
    expect(startB.body.job_status).toBe("in_progress");
  });

  test("M9: session returns active_jobs queue including on_hold", async () => {
    const tech = await seedTechnician();
    const token = technicianToken(tech._id);

    const first = await createAcceptedTechJob(techApp, token, { clientName: "Queue 1" });
    await adminHoldJob(first.body.job._id, "Hold for queue");
    await createAcceptedTechJob(techApp, token, { clientName: "Queue 2" });

    const session = await request(techApp)
      .get("/api/jobs/technician/session")
      .set(bearer(token));
    expect(session.status).toBe(200);
    expect(session.body.active_jobs.length).toBeGreaterThanOrEqual(2);
    expect(session.body.active_job).toBeTruthy();
    expect(session.body.active_job.job_status).toBe("accepted");
  });

  test("OH-5: can start a new job while another remains on_hold", async () => {
    const tech = await seedTechnician();
    const token = technicianToken(tech._id);

    const jobA = await createAcceptedTechJob(techApp, token, { clientName: "Held A" });
    const idA = jobA.body.job._id;
    await adminHoldJob(idA, "Garage — start B first");

    const jobB = await createAcceptedTechJob(techApp, token, { clientName: "Active B" });
    const idB = jobB.body.job._id;
    const startB = await advanceToInProgress(techApp, token, idB);
    expect(startB.status).toBe(200);
    expect(startB.body.job_status).toBe("in_progress");

    const held = await Job.findById(idA).lean();
    expect(held.job_status).toBe("on_hold");
  });

  test("M10: cannot go Offline while active accepted job exists", async () => {
    const tech = await seedTechnician();
    const token = technicianToken(tech._id);

    await createAcceptedTechJob(techApp, token);

    const offline = await request(techApp)
      .patch("/api/technicians/status")
      .set(bearer(token))
      .send({ status: "Offline" });
    expect(offline.status).toBe(400);
    expect(offline.body.error).toMatch(/Cannot go Offline while you have an active job/i);
  });

  test("H3: completion_notes stores garage deferral workaround", async () => {
    const tech = await seedTechnician();
    const token = technicianToken(tech._id);
    const created = await createAcceptedTechJob(techApp, token);
    const jobId = created.body.job._id;

    await advanceToInProgress(techApp, token, jobId);
    await request(techApp)
      .post(`/api/jobs/${jobId}/payment`)
      .set(bearer(token))
      .send({ payment_method: "cash" });
    await request(techApp)
      .post(`/api/jobs/${jobId}/signature`)
      .set(bearer(token))
      .attach("signature", Buffer.from("fake"), "sign.png");

    const note = "Sent to garage for 2-day maintenance — return visit needed";
    const complete = await request(techApp)
      .post(`/api/jobs/${jobId}/complete`)
      .set(bearer(token))
      .send({
        completion_notes: note,
        notes: note,
        job_reference: "QA-GARAGE",
      });

    expect(complete.status).toBe(200);
    const saved = await Job.findById(jobId).lean();
    expect(saved.completion_notes).toContain("garage");
    expect(saved.job_status).toBe("completed");
  });

  test("H5: job at arrived stays in session and blocks offline", async () => {
    const tech = await seedTechnician();
    const token = technicianToken(tech._id);
    const created = await createAcceptedTechJob(techApp, token);
    const jobId = created.body.job._id;

    await request(techApp)
      .patch(`/api/jobs/${jobId}/status`)
      .set(bearer(token))
      .send({ job_status: "en_route" });
    await request(techApp)
      .post(`/api/jobs/${jobId}/arrive`)
      .set(bearer(token))
      .send({});

    const session = await request(techApp)
      .get("/api/jobs/technician/session")
      .set(bearer(token));
    const stuck = session.body.active_jobs.find((j) => String(j._id) === String(jobId));
    expect(stuck?.job_status).toBe("arrived");

    const offline = await request(techApp)
      .patch("/api/technicians/status")
      .set(bearer(token))
      .send({ status: "Offline" });
    expect(offline.status).toBe(400);
  });

  test("H6: admin hold requires reason; GET returns hold fields; PUT on_hold rejected", async () => {
    const tech = await seedTechnician();
    const source = await seedSource("Admin QA");
    const token = adminToken("Super Admin");

    const job = await Job.create({
      clientName: "Hold test",
      clientMobileNumber: "+97450000099",
      issue: "QA H6",
      location: `${JOB_LAT},${JOB_LNG}`,
      locationCoordinates: { type: "Point", coordinates: [JOB_LNG, JOB_LAT] },
      dateTime: new Date(),
      jobType: "Flat Tire",
      assignedTechnician: tech._id,
      price: 100,
      source: source._id,
      job_status: "accepted",
      payment_status: "unpaid",
    });

    const putHold = await request(adminApp)
      .put(`/api/jobs/${job._id}`)
      .set(bearer(token))
      .send({ job_status: "on_hold" });
    expect(putHold.status).toBe(400);

    const noReason = await request(adminApp)
      .post(`/api/jobs/${job._id}/hold`)
      .set(bearer(token))
      .send({});
    expect(noReason.status).toBe(400);

    const hold = await request(adminApp)
      .post(`/api/jobs/${job._id}/hold`)
      .set(bearer(token))
      .send({ reason: "Admin: waiting on garage" });
    expect(hold.status).toBe(200);
    expect(hold.body.job.job_status).toBe("on_hold");
    expect(hold.body.job.hold_reason).toMatch(/garage/i);
    expect(hold.body.job.held_by).toBe("admin");

    const fetched = await request(adminApp)
      .get(`/api/jobs/${job._id}`)
      .set(bearer(token));
    expect(fetched.status).toBe(200);
    const body = fetched.body.job || fetched.body;
    expect(body.hold_reason).toMatch(/garage/i);
    expect(body.on_hold_at).toBeTruthy();
    expect(body.held_by).toBe("admin");

    const resume = await request(adminApp)
      .post(`/api/jobs/${job._id}/resume`)
      .set(bearer(token))
      .send({});
    expect(resume.status).toBe(200);
    expect(resume.body.job.job_status).toBe("accepted");
    expect(resume.body.job.hold_reason).toMatch(/garage/i);
  });
});
