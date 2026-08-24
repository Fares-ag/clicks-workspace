const request = require("supertest");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const { adminToken, bearer, technicianToken } = require("../helpers/tokens");
const {
  seedTechnician,
  seedCustomer,
  seedSource,
  seedAdmin,
} = require("../helpers/seed");
const { Job } = require("../../clicks-shared/models");

let techApp;

beforeAll(async () => {
  await connectTestDb();
  techApp = require("../../clicks-customer-tech-api/src/createApp").createTechApp().app;
});

afterAll(async () => {
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearCollections();
  // requireRoles now confirms the caller is still an active Admin document,
  // so an admin token needs a matching record — as it always does in production.
  await seedAdmin();
});

async function seedManyJobs(technician, count) {
  const source = await seedSource();
  const jobs = [];
  for (let i = 0; i < count; i++) {
    jobs.push({
      clientName: `Client ${i}`,
      clientMobileNumber: `+9745000${String(i).padStart(4, "0")}`,
      issue: "Test",
      location: "25.28,51.53",
      dateTime: new Date(Date.now() - i * 60000),
      jobType: "Flat tire",
      assignedTechnician: technician._id,
      price: 100,
      source: source._id,
      job_status: "completed",
      createdAt: new Date(Date.now() - i * 60000),
    });
  }
  await Job.insertMany(jobs);
}

describe("Mobile job history pagination", () => {
  test("default returns 20 newest with has_more", async () => {
    const tech = await seedTechnician();
    await seedManyJobs(tech, 25);
    const token = technicianToken(tech._id);

    const res = await request(techApp)
      .get("/api/technicians/jobs")
      .set(bearer(token));

    expect(res.status).toBe(200);
    expect(res.body.jobs.length).toBe(20);
    expect(res.body.has_more).toBe(true);
    expect(res.body.total).toBe(25);
  });

  test("total is null on page 2", async () => {
    const tech = await seedTechnician();
    await seedManyJobs(tech, 25);
    const token = technicianToken(tech._id);

    const res = await request(techApp)
      .get("/api/technicians/jobs?page=2&limit=20")
      .set(bearer(token));

    expect(res.status).toBe(200);
    expect(res.body.total).toBeNull();
    expect(res.body.page).toBe(2);
  });

  test("limit>50 clamps to 50", async () => {
    const tech = await seedTechnician();
    await seedManyJobs(tech, 60);
    const token = technicianToken(tech._id);

    const res = await request(techApp)
      .get("/api/technicians/jobs?limit=999")
      .set(bearer(token));

    expect(res.status).toBe(200);
    expect(res.body.jobs.length).toBe(50);
  });
});

function deepHasKey(obj, key) {
  if (!obj || typeof obj !== "object") return false;
  if (Object.prototype.hasOwnProperty.call(obj, key)) return true;
  return Object.values(obj).some((v) => deepHasKey(v, key));
}

describe("Payload guards", () => {
  test("admin jobs list has no password key", async () => {
    const tech = await seedTechnician();
    const source = await seedSource();
    await Job.create({
      clientName: "Guard Test",
      clientMobileNumber: "+97450001234",
      issue: "Test",
      location: "25.28,51.53",
      dateTime: new Date(),
      jobType: "Flat tire",
      assignedTechnician: tech._id,
      price: 100,
      source: source._id,
      job_status: "pending",
    });

    const adminApp = require("../../clicks-admin-api/src/createApp").createAdminApp();
    const res = await request(adminApp)
      .get("/api/jobs")
      .set(bearer(adminToken("Super Admin")));

    expect(res.status).toBe(200);
    expect(deepHasKey(res.body, "password")).toBe(false);
    expect(deepHasKey(res.body, "workPermitFront")).toBe(false);
  });
});
