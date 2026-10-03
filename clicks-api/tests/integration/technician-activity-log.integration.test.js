const request = require("supertest");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const { technicianToken, adminToken, bearer } = require("../helpers/tokens");
const { seedTechnician, seedSource, seedAdmin } = require("../helpers/seed");
const Job = require("../../clicks-shared/models/Job");
const Technician = require("../../clicks-shared/models/Technician");
const TechnicianActivityLog = require("../../clicks-shared/models/TechnicianActivityLog");
const {
  flushTechnicianActivity,
  resetTechnicianActivityThrottle,
} = require("../../clicks-shared/services/technicianActivityLog");

let techApp;
let adminApp;

const JOB_LAT = 25.2854;
const JOB_LNG = 51.531;
/** seedTechnician already stores a bcrypt hash of this. */
const PASSWORD = "password123";

async function seedTechnicianWithPassword(overrides = {}) {
  return seedTechnician(overrides);
}

/** All activity rows for one technician, oldest first. */
async function logsFor(technicianId, event) {
  await flushTechnicianActivity();
  const filter = { technician_id: technicianId };
  if (event) filter.event = event;
  return TechnicianActivityLog.find(filter).sort({ at: 1 }).lean();
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
  resetTechnicianActivityThrottle();
});

describe("Technician activity log — writers", () => {
  test("a successful login is recorded with the technician and request context", async () => {
    const tech = await seedTechnicianWithPassword();

    const res = await request(techApp)
      .post("/api/technicians/login")
      .set("user-agent", "ClicksTechnician/1.2.3 (Android 16)")
      .set("x-app-version", "1.2.3")
      .set("x-app-platform", "android")
      .send({ phone: tech.phone, password: PASSWORD });
    expect(res.status).toBe(200);

    const rows = await logsFor(tech._id, "auth.login.success");
    expect(rows).toHaveLength(1);
    expect(rows[0].category).toBe("auth");
    expect(rows[0].outcome).toBe("success");
    expect(rows[0].technician_name).toMatch(/Test Technician/i);
    expect(rows[0].app_version).toBe("1.2.3");
    expect(rows[0].platform).toBe("android");
    expect(rows[0].user_agent).toMatch(/ClicksTechnician/);
    expect(rows[0].status_code).toBe(200);
  });

  test("a wrong-password attempt is recorded against the account, without the password", async () => {
    const tech = await seedTechnicianWithPassword();

    const res = await request(techApp)
      .post("/api/technicians/login")
      .send({ phone: tech.phone, password: "not-the-password" });
    expect(res.status).toBe(401);

    const rows = await logsFor(tech._id, "auth.login.failed");
    expect(rows).toHaveLength(1);
    expect(rows[0].outcome).toBe("failure");
    expect(rows[0].identifier).toBe(tech.phone);
    expect(rows[0].metadata.reason).toBe("wrong_password");
    expect(rows[0].status_code).toBe(401);
    expect(JSON.stringify(rows[0])).not.toContain("not-the-password");
  });

  test("a login attempt for an unknown number is recorded with the typed identifier", async () => {
    const res = await request(techApp)
      .post("/api/technicians/login")
      .send({ phone: "+97499999999", password: "whatever" });
    expect(res.status).toBe(401);

    await flushTechnicianActivity();
    const rows = await TechnicianActivityLog.find({ event: "auth.login.failed" }).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0].technician_id).toBeNull();
    expect(rows[0].identifier).toBe("+97499999999");
    expect(rows[0].metadata.reason).toBe("unknown_account");
  });

  test("a deactivated account is recorded as blocked, not as a failed password", async () => {
    const tech = await seedTechnicianWithPassword({ isActive: false });

    const res = await request(techApp)
      .post("/api/technicians/login")
      .send({ phone: tech.phone, password: PASSWORD });
    expect(res.status).toBe(403);

    const rows = await logsFor(tech._id, "account.blocked");
    expect(rows).toHaveLength(1);
    expect(rows[0].outcome).toBe("blocked");
    expect(rows[0].metadata.reason).toBe("deactivated");
  });

  test("going online and offline is recorded, and a blocked offline attempt too", async () => {
    const tech = await seedTechnicianWithPassword();
    const token = technicianToken(tech._id);
    const source = await seedSource("Activity");

    await request(techApp)
      .patch("/api/technicians/status")
      .set(bearer(token))
      .send({ status: "Online" });

    // An active job must block going offline — and leave a trail.
    const job = await Job.create({
      clientName: "Activity log",
      clientMobileNumber: "+97450000401",
      issue: "QA activity",
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

    const blocked = await request(techApp)
      .patch("/api/technicians/status")
      .set(bearer(token))
      .send({ status: "Offline" });
    expect(blocked.status).toBe(400);

    const online = await logsFor(tech._id, "session.online");
    expect(online).toHaveLength(1);

    const blockedRows = await logsFor(tech._id, "session.offline_blocked");
    expect(blockedRows).toHaveLength(1);
    expect(blockedRows[0].outcome).toBe("blocked");
    expect(String(blockedRows[0].job_id)).toBe(String(job._id));
  });

  test("the job lifecycle is recorded step by step, including blocked completes", async () => {
    const tech = await seedTechnicianWithPassword();
    const token = technicianToken(tech._id);
    const source = await seedSource("Lifecycle");

    const created = await request(techApp)
      .post("/api/technicians/jobs")
      .set(bearer(token))
      .send({
        clientName: "Lifecycle customer",
        clientMobileNumber: "55501234",
        countryCode: "+974",
        vehicleMake: "Toyota",
        vehicleModel: "Camry",
        issue: "QA lifecycle",
        location: `LatLng(${JOB_LAT}, ${JOB_LNG})`,
        dateTime: new Date().toISOString(),
        jobType: "Flat Tire",
        price: 150,
      });
    expect(created.status).toBe(201);
    const jobId = created.body.job._id;

    await request(techApp)
      .patch(`/api/jobs/${jobId}/status`)
      .set(bearer(token))
      .send({ job_status: "en_route" });
    await request(techApp).post(`/api/jobs/${jobId}/arrive`).set(bearer(token)).send({});
    await request(techApp).post(`/api/jobs/${jobId}/start`).set(bearer(token)).send({});

    // Complete without payment → blocked, and recorded as such.
    const blockedComplete = await request(techApp)
      .post(`/api/jobs/${jobId}/complete`)
      .set(bearer(token))
      .send({ job_reference: "QA-1" });
    expect(blockedComplete.status).toBe(400);

    await request(techApp)
      .post(`/api/jobs/${jobId}/payment`)
      .set(bearer(token))
      .send({ payment_method: "cash" });

    await flushTechnicianActivity();
    const events = (await logsFor(tech._id)).map((row) => row.event);
    expect(events).toEqual(
      expect.arrayContaining([
        "job.created",
        "job.en_route",
        "job.arrived",
        "job.started",
        "job.complete_blocked",
        "job.payment_collected",
      ])
    );

    // Payment is the first gate the API checks, so that is the recorded reason.
    const blockedRow = (await logsFor(tech._id, "job.complete_blocked"))[0];
    expect(blockedRow.metadata.reason).toBe("payment_missing");
    expect(String(blockedRow.job_id)).toBe(String(jobId));

    const payment = (await logsFor(tech._id, "job.payment_collected"))[0];
    expect(payment.metadata.payment_method).toBe("cash");
  });

  test("a hold request records the reason the technician gave", async () => {
    const tech = await seedTechnicianWithPassword();
    const token = technicianToken(tech._id);
    const source = await seedSource("Hold");

    const job = await Job.create({
      clientName: "Hold customer",
      clientMobileNumber: "+97450000402",
      issue: "QA hold",
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

    const res = await request(techApp)
      .post(`/api/jobs/${job._id}/hold-request`)
      .set(bearer(token))
      .send({ reason: "Car went to the garage for two days" });
    expect(res.status).toBe(200);

    const rows = await logsFor(tech._id, "job.hold_requested");
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata.reason).toMatch(/garage/i);
  });

  test("logout (push token cleared) is recorded", async () => {
    const tech = await seedTechnicianWithPassword();
    const token = technicianToken(tech._id);

    await request(techApp)
      .post("/api/technicians/fcm-token")
      .set(bearer(token))
      .send({ fcm_token: "a".repeat(140) });
    const res = await request(techApp)
      .delete("/api/technicians/fcm-token")
      .set(bearer(token));
    expect(res.status).toBe(200);

    const registered = await logsFor(tech._id, "device.push_token_registered");
    expect(registered).toHaveLength(1);
    // The token is a credential: only its length is kept.
    expect(registered[0].metadata.token_length).toBe(140);
    expect(JSON.stringify(registered[0])).not.toContain("aaaaaaaaaa");

    const logout = await logsFor(tech._id, "auth.logout");
    expect(logout).toHaveLength(1);
  });

  test("location pings are throttled so the trail is not flooded", async () => {
    const tech = await seedTechnicianWithPassword();
    const token = technicianToken(tech._id);

    for (let i = 0; i < 4; i += 1) {
      await request(techApp)
        .patch("/api/technicians/location")
        .set(bearer(token))
        .send({ latitude: JOB_LAT + i * 0.01, longitude: JOB_LNG + i * 0.01 });
    }

    const rows = await logsFor(tech._id, "location.updated");
    expect(rows).toHaveLength(1);
    expect(rows[0].coordinates.coordinates[1]).toBeCloseTo(JOB_LAT, 3);
  });
});

describe("Technician activity log — admin endpoint", () => {
  async function seedRows(technician) {
    await request(techApp)
      .post("/api/technicians/login")
      .send({ phone: technician.phone, password: PASSWORD });
    await request(techApp)
      .post("/api/technicians/login")
      .send({ phone: technician.phone, password: "wrong" });
    await flushTechnicianActivity();
  }

  test("GET /api/technician-activity lists newest first with labels", async () => {
    const tech = await seedTechnicianWithPassword();
    await seedRows(tech);

    const res = await request(adminApp)
      .get("/api/technician-activity")
      .set(bearer(adminToken("Super Admin")));
    expect(res.status).toBe(200);
    expect(res.body.logs.length).toBeGreaterThanOrEqual(2);
    expect(res.body.pagination.total).toBeGreaterThanOrEqual(2);

    const [newest] = res.body.logs;
    expect(newest.event).toBe("auth.login.failed");
    expect(newest.event_label).toBe("Login failed");
    expect(newest.severity).toBe("alert");
    expect(newest.technician.name).toMatch(/Test Technician/i);
  });

  test("filters by event, outcome and technician", async () => {
    // Explicit phones: seedTechnician keys its default off Date.now(), which
    // collides when two are created in the same millisecond.
    const tech = await seedTechnicianWithPassword({ phone: "+97455510001" });
    const other = await seedTechnicianWithPassword({
      phone: "+97455510002",
      email: "other-activity@test.local",
    });
    await seedRows(tech);
    await seedRows(other);

    const token = adminToken("Super Admin");

    const byEvent = await request(adminApp)
      .get("/api/technician-activity?event=auth.login.failed")
      .set(bearer(token));
    expect(byEvent.status).toBe(200);
    expect(byEvent.body.logs).toHaveLength(2);
    expect(byEvent.body.logs.every((row) => row.event === "auth.login.failed")).toBe(true);

    const byTechnician = await request(adminApp)
      .get(`/api/technician-activity?technician_id=${tech._id}`)
      .set(bearer(token));
    expect(byTechnician.body.logs.length).toBe(2);
    expect(
      byTechnician.body.logs.every((row) => row.technician_id === String(tech._id))
    ).toBe(true);

    const byOutcome = await request(adminApp)
      .get("/api/technician-activity?outcome=failure")
      .set(bearer(token));
    expect(byOutcome.body.logs.every((row) => row.outcome === "failure")).toBe(true);
  });

  test("search matches the typed number of a failed attempt on an unknown account", async () => {
    await request(techApp)
      .post("/api/technicians/login")
      .send({ phone: "+97488887777", password: "x" });
    await flushTechnicianActivity();

    const res = await request(adminApp)
      .get("/api/technician-activity?search=88887777")
      .set(bearer(adminToken("Super Admin")));
    expect(res.status).toBe(200);
    expect(res.body.logs).toHaveLength(1);
    expect(res.body.logs[0].identifier).toBe("+97488887777");
    expect(res.body.logs[0].technician_id).toBeNull();
  });

  test("date range filter narrows the list", async () => {
    const tech = await seedTechnicianWithPassword();
    await seedRows(tech);
    const token = adminToken("Super Admin");

    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const empty = await request(adminApp)
      .get(`/api/technician-activity?from=${future}`)
      .set(bearer(token));
    expect(empty.body.logs).toHaveLength(0);

    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const all = await request(adminApp)
      .get(`/api/technician-activity?from=${past}`)
      .set(bearer(token));
    expect(all.body.logs.length).toBeGreaterThanOrEqual(2);
  });

  test("summary counts failed logins over the window", async () => {
    const tech = await seedTechnicianWithPassword();
    await seedRows(tech);

    const res = await request(adminApp)
      .get("/api/technician-activity/summary?days=7")
      .set(bearer(adminToken("Super Admin")));
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(2);
    expect(res.body.failed_logins).toBe(1);
  });

  test("filters endpoint lists the event catalog for the dropdowns", async () => {
    const res = await request(adminApp)
      .get("/api/technician-activity/filters")
      .set(bearer(adminToken("Super Admin")));
    expect(res.status).toBe(200);
    expect(res.body.categories.length).toBeGreaterThan(3);
    expect(res.body.events.some((e) => e.value === "auth.login.failed")).toBe(true);
    expect(res.body.outcomes.map((o) => o.value)).toEqual([
      "success",
      "failure",
      "blocked",
    ]);
  });

  test("CSV export returns a header row and the filtered rows", async () => {
    const tech = await seedTechnicianWithPassword();
    await seedRows(tech);

    const res = await request(adminApp)
      .get("/api/technician-activity/export?event=auth.login.failed")
      .set(bearer(adminToken("Super Admin")));
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    const lines = res.text.trim().split("\n");
    expect(lines[0]).toBe(
      "at,technician,phone,event,outcome,message,job_reference,ip,app_version,platform"
    );
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(/Login failed/);
  });

  test("ops roles cannot read the trail; full admins can", async () => {
    const dispatcher = await request(adminApp)
      .get("/api/technician-activity")
      .set(bearer(adminToken("Job Dispatcher")));
    expect(dispatcher.status).toBe(403);

    const anonymous = await request(adminApp).get("/api/technician-activity");
    expect(anonymous.status).toBe(401);

    const admin = await request(adminApp)
      .get("/api/technician-activity")
      .set(bearer(adminToken("Super Admin")));
    expect(admin.status).toBe(200);
  });
});
