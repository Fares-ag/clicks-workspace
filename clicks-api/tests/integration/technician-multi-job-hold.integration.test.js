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

  test("create is allowed while another fulfill-path job is active", async () => {
    const tech = await seedTechnician();
    const token = technicianToken(tech._id);

    const first = await createAcceptedTechJob(techApp, token, { clientName: "Job A" });
    expect(first.status).toBe(201);

    const second = await createAcceptedTechJob(techApp, token, { clientName: "Job B" });
    expect(second.status).toBe(201);
    expect(second.body.job.job_status).toBe("accepted");
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

  test("M5/M6: multiple in_progress jobs allowed; complete one then continue the other", async () => {
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

    const startB = await request(techApp)
      .post(`/api/jobs/${idB}/start`)
      .set(bearer(token))
      .send({});
    expect(startB.status).toBe(200);
    expect(startB.body.job_status).toBe("in_progress");

    const jobAState = await Job.findById(idA).lean();
    const jobBState = await Job.findById(idB).lean();
    expect(jobAState.job_status).toBe("in_progress");
    expect(jobBState.job_status).toBe("in_progress");

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

    const startBAgain = await Job.findById(idB).lean();
    expect(startBAgain.job_status).toBe("in_progress");
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

  test("HR1: technician hold request stays pending until admin approves", async () => {
    const tech = await seedTechnician();
    const token = technicianToken(tech._id);
    const created = await createAcceptedTechJob(techApp, token, { clientName: "Hold request job" });
    const jobId = created.body.job._id;

    const reqHold = await request(techApp)
      .post(`/api/jobs/${jobId}/hold-request`)
      .set(bearer(token))
      .send({ reason: "Need to send car to garage" });
    expect(reqHold.status).toBe(200);
    expect(reqHold.body.job.job_status).toBe("accepted");
    expect(reqHold.body.job.hold_request.status).toBe("pending");
    expect(reqHold.body.job.hold_request.reason).toMatch(/garage/i);

    const dup = await request(techApp)
      .post(`/api/jobs/${jobId}/hold-request`)
      .set(bearer(token))
      .send({ reason: "Duplicate" });
    expect(dup.status).toBe(409);

    const adminTok = adminToken("Super Admin");
    const approve = await request(adminApp)
      .post(`/api/jobs/${jobId}/hold-request/approve`)
      .set(bearer(adminTok))
      .send({});
    expect(approve.status).toBe(200);
    expect(approve.body.job.job_status).toBe("on_hold");
    expect(approve.body.job.hold_reason).toMatch(/garage/i);
    expect(approve.body.job.held_by).toBe("technician");
    expect(approve.body.job.hold_request.status).toBe("approved");
  });

  test("HR2: admin can reject hold request without changing job status", async () => {
    const tech = await seedTechnician();
    const token = technicianToken(tech._id);
    const created = await createAcceptedTechJob(techApp, token);
    const jobId = created.body.job._id;

    await request(techApp)
      .post(`/api/jobs/${jobId}/hold-request`)
      .set(bearer(token))
      .send({ reason: "Waiting on customer approval" });

    const adminTok = adminToken("Super Admin");
    const reject = await request(adminApp)
      .post(`/api/jobs/${jobId}/hold-request/reject`)
      .set(bearer(adminTok))
      .send({ note: "Customer wants tech today" });
    expect(reject.status).toBe(200);
    expect(reject.body.job.job_status).toBe("accepted");
    expect(reject.body.job.hold_request.status).toBe("rejected");
    expect(reject.body.job.hold_request.decision_note).toMatch(/today/i);
  });

  test("HR3: direct admin hold supersedes pending hold request", async () => {
    const tech = await seedTechnician();
    const token = technicianToken(tech._id);
    const created = await createAcceptedTechJob(techApp, token);
    const jobId = created.body.job._id;

    await request(techApp)
      .post(`/api/jobs/${jobId}/hold-request`)
      .set(bearer(token))
      .send({ reason: "Tech requested hold" });

    const adminTok = adminToken("Super Admin");
    const direct = await request(adminApp)
      .post(`/api/jobs/${jobId}/hold`)
      .set(bearer(adminTok))
      .send({ reason: "Dispatch direct hold" });
    expect(direct.status).toBe(200);
    expect(direct.body.job.job_status).toBe("on_hold");
    expect(direct.body.job.hold_reason).toMatch(/Dispatch direct hold/i);
  });

  test("MA1: technician can accept a second assigned job while the first is already accepted", async () => {
    const tech = await seedTechnician();
    const source = await seedSource("Multi accept");
    const token = technicianToken(tech._id);

    const assignedJob = (label) =>
      Job.create({
        clientName: `Multi accept ${label}`,
        clientMobileNumber: `+9745000${label === "A" ? "0101" : "0102"}`,
        issue: `QA MA1 ${label}`,
        location: `${JOB_LAT},${JOB_LNG}`,
        locationCoordinates: { type: "Point", coordinates: [JOB_LNG, JOB_LAT] },
        dateTime: new Date(),
        jobType: "Flat Tire",
        assignedTechnician: tech._id,
        price: 100,
        source: source._id,
        job_status: "assigned",
        payment_status: "unpaid",
      });
    const jobA = await assignedJob("A");
    const jobB = await assignedJob("B");

    const acceptA = await request(techApp)
      .post(`/api/technicians/jobs/${jobA._id}/accept`)
      .set(bearer(token))
      .send({});
    expect(acceptA.status).toBe(200);
    expect(acceptA.body.job_status).toBe("accepted");

    // B stays assigned and is still visible in the session queue.
    let session = await request(techApp)
      .get("/api/jobs/technician/session")
      .set(bearer(token));
    expect(session.status).toBe(200);
    const queuedB = (session.body.active_jobs || []).find(
      (j) => String(j._id) === String(jobB._id)
    );
    expect(queuedB).toBeTruthy();
    expect(queuedB.job_status).toBe("assigned");

    const acceptB = await request(techApp)
      .post(`/api/technicians/jobs/${jobB._id}/accept`)
      .set(bearer(token))
      .send({});
    expect(acceptB.status).toBe(200);
    expect(acceptB.body.job_status).toBe("accepted");

    session = await request(techApp)
      .get("/api/jobs/technician/session")
      .set(bearer(token));
    const statuses = Object.fromEntries(
      (session.body.active_jobs || []).map((j) => [String(j._id), j.job_status])
    );
    expect(statuses[String(jobA._id)]).toBe("accepted");
    expect(statuses[String(jobB._id)]).toBe("accepted");

    // Accepting an already-accepted job is rejected.
    const again = await request(techApp)
      .post(`/api/technicians/jobs/${jobB._id}/accept`)
      .set(bearer(token))
      .send({});
    expect(again.status).toBe(400);
  });
});
