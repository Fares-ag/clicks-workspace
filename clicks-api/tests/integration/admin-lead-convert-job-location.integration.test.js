const request = require("supertest");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const { adminToken, bearer } = require("../helpers/tokens");
const { seedTechnician, seedSource, seedAdmin } = require("../helpers/seed");
const Job = require("../../clicks-shared/models/Job");
const Lead = require("../../clicks-shared/models/Lead");

let adminApp;

const JOB_LAT = 25.2854;
const JOB_LNG = 51.531;
const NEW_LAT = 25.3269467;
const NEW_LNG = 51.4883967;

function jobDoc({ source, technician, status, extra = {} }) {
  return Job.create({
    clientName: `Location ${status}`,
    clientMobileNumber: "+97450000201",
    issue: `QA location guard ${status}`,
    location: `${JOB_LAT}, ${JOB_LNG}`,
    locationCoordinates: { type: "Point", coordinates: [JOB_LNG, JOB_LAT] },
    dateTime: new Date(),
    jobType: "Flat Tire",
    assignedTechnician: technician ? technician._id : null,
    price: 100,
    source: source._id,
    job_status: status,
    payment_status: "unpaid",
    ...extra,
  });
}

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

describe("Admin: edit job location (blocked when completed)", () => {
  test("PUT /api/jobs/:id rejects a location change on a completed job", async () => {
    const source = await seedSource("Loc guard");
    const tech = await seedTechnician();
    const job = await jobDoc({
      source,
      technician: tech,
      status: "completed",
      extra: { payment_status: "paid", completed_at: new Date() },
    });
    const token = adminToken("Super Admin");

    const res = await request(adminApp)
      .put(`/api/jobs/${job._id}`)
      .set(bearer(token))
      .send({ location: `${NEW_LAT}, ${NEW_LNG}` });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/completed/i);

    const unchanged = await Job.findById(job._id).lean();
    expect(unchanged.locationCoordinates.coordinates).toEqual([JOB_LNG, JOB_LAT]);
    expect(unchanged.location).toBe(`${JOB_LAT}, ${JOB_LNG}`);
  });

  test("PUT /api/jobs/:id without location still works on a completed job", async () => {
    const source = await seedSource("Loc guard other fields");
    const job = await jobDoc({ source, status: "completed", extra: { payment_status: "paid" } });
    const token = adminToken("Super Admin");

    const res = await request(adminApp)
      .put(`/api/jobs/${job._id}`)
      .set(bearer(token))
      .send({ issue: "Updated notes after completion" });
    expect(res.status).toBe(200);
    expect(res.body.job.issue).toBe("Updated notes after completion");
  });

  test.each(["pending", "accepted", "in_progress", "on_hold", "cancelled"])(
    "PUT /api/jobs/:id updates location + coordinates on a %s job",
    async (status) => {
      const source = await seedSource(`Loc ${status}`);
      const tech = status === "pending" ? null : await seedTechnician();
      const extra = status === "on_hold" ? { status_before_hold: "accepted", hold_reason: "QA" } : {};
      const job = await jobDoc({ source, technician: tech, status, extra });
      const token = adminToken("Super Admin");

      const res = await request(adminApp)
        .put(`/api/jobs/${job._id}`)
        .set(bearer(token))
        .send({ location: `${NEW_LAT}, ${NEW_LNG}` });
      expect(res.status).toBe(200);
      expect(res.body.job.location).toBe(`${NEW_LAT}, ${NEW_LNG}`);
      expect(res.body.job.locationCoordinates.coordinates[0]).toBeCloseTo(NEW_LNG, 6);
      expect(res.body.job.locationCoordinates.coordinates[1]).toBeCloseTo(NEW_LAT, 6);

      const stored = await Job.findById(job._id).lean();
      expect(stored.locationCoordinates.coordinates[1]).toBeCloseTo(NEW_LAT, 6);
    }
  );

  test("PUT /api/jobs/:id with a Google Maps link resolves coordinates", async () => {
    const source = await seedSource("Loc maps link");
    const job = await jobDoc({ source, status: "pending" });
    const token = adminToken("Super Admin");

    const res = await request(adminApp)
      .put(`/api/jobs/${job._id}`)
      .set(bearer(token))
      .send({ location: `https://www.google.com/maps/place/Doha/@${NEW_LAT},${NEW_LNG},14z` });
    expect(res.status).toBe(200);
    expect(res.body.job.locationCoordinates.coordinates[1]).toBeCloseTo(NEW_LAT, 6);
  });

  test("PUT /api/jobs/:id with an unresolvable location returns 400", async () => {
    const source = await seedSource("Loc bad");
    const job = await jobDoc({ source, status: "pending" });
    const token = adminToken("Super Admin");

    const res = await request(adminApp)
      .put(`/api/jobs/${job._id}`)
      .set(bearer(token))
      .send({ location: "+97455555555" });
    expect(res.status).toBe(400);
  });
});

describe("Admin: convert lost leads", () => {
  function convertBody(overrides = {}) {
    return {
      location: `${JOB_LAT}, ${JOB_LNG}`,
      dateTime: new Date(Date.now() + 3600000).toISOString(),
      jobType: "Flat Tire",
      price: 120,
      issue: "Customer came back after being marked lost",
      ...overrides,
    };
  }

  async function seedLead(source, overrides = {}) {
    return Lead.create({
      clientName: "Lost Lead Customer",
      clientMobileNumber: "+97450000301",
      inquiry: "Needs a tow",
      source: source._id,
      status: "new",
      ...overrides,
    });
  }

  test("a lost lead converts to a job: status converted, job linked, lost_reason cleared", async () => {
    const source = await seedSource("Lost convert");
    const lead = await seedLead(source, { status: "lost", lost_reason: "no answer" });
    const token = adminToken("Super Admin");

    const res = await request(adminApp)
      .post(`/api/leads/${lead._id}/convert`)
      .set(bearer(token))
      .send(convertBody());
    expect(res.status).toBe(201);
    const jobId = res.body.job?._id;
    expect(jobId).toBeTruthy();
    expect(res.body.lead.status).toBe("converted");
    expect(String(res.body.lead.job_id)).toBe(String(jobId));
    expect(res.body.lead.lost_reason).toBe("");

    const stored = await Lead.findById(lead._id).lean();
    expect(stored.status).toBe("converted");
    expect(String(stored.job_id)).toBe(String(jobId));
    expect(stored.lost_reason).toBe("");
    expect(stored.converted_at).toBeTruthy();

    const job = await Job.findById(jobId).lean();
    expect(String(job.lead_id)).toBe(String(lead._id));
  });

  test("converting a lost lead twice is rejected (already converted)", async () => {
    const source = await seedSource("Lost convert twice");
    const lead = await seedLead(source, { status: "lost", lost_reason: "price" });
    const token = adminToken("Super Admin");

    const first = await request(adminApp)
      .post(`/api/leads/${lead._id}/convert`)
      .set(bearer(token))
      .send(convertBody());
    expect(first.status).toBe(201);

    const second = await request(adminApp)
      .post(`/api/leads/${lead._id}/convert`)
      .set(bearer(token))
      .send(convertBody({ clientMobileNumber: "+97450000302" }));
    expect(second.status).toBe(400);
    expect(second.body.message).toMatch(/already converted/i);
  });

  test("open leads still convert and the open list still excludes lost leads", async () => {
    const source = await seedSource("Open convert");
    const openLead = await seedLead(source, { status: "qualified" });
    await seedLead(source, {
      status: "lost",
      lost_reason: "competitor",
      clientMobileNumber: "+97450000303",
    });
    const token = adminToken("Super Admin");

    const res = await request(adminApp)
      .post(`/api/leads/${openLead._id}/convert`)
      .set(bearer(token))
      .send(convertBody());
    expect(res.status).toBe(201);
    expect(res.body.lead.status).toBe("converted");

    const open = await request(adminApp)
      .get("/api/leads?open=1")
      .set(bearer(token));
    expect(open.status).toBe(200);
    const statuses = (open.body.leads || []).map((l) => l.status);
    expect(statuses).not.toContain("lost");
    expect(statuses).not.toContain("converted");
  });
});
