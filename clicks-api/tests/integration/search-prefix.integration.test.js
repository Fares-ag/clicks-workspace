const request = require("supertest");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const { adminToken, bearer } = require("../helpers/tokens");
const { Job, Lead, Source } = require("../../clicks-shared/models");
const { seedAdmin } = require("../helpers/seed");

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
  // requireRoles now confirms the caller is still an active Admin document,
  // so an admin token needs a matching record — as it always does in production.
  await seedAdmin();
});

async function seedJobWithPhone(phone, name) {
  const source = await Source.create({ mainSourceName: "Search Test", isActive: true });
  return Job.create({
    clientName: name,
    clientMobileNumber: phone,
    issue: "Battery",
    location: "25.28,51.53",
    dateTime: new Date(),
    jobType: "Flat tire",
    price: 100,
    source: source._id,
    job_status: "pending",
  });
}

async function seedLeadWithPhone(phone, name) {
  const source = await Source.create({ mainSourceName: "Lead Search", isActive: true });
  return Lead.create({
    clientName: name,
    clientMobileNumber: phone,
    inquiry: "Need tow",
    source: source._id,
    status: "new",
  });
}

describe("Admin jobs/leads prefix search", () => {
  test("phone digits match regardless of stored formatting", async () => {
    await seedJobWithPhone("+974 5551 2345", "Ahmed Ali");
    const token = adminToken("Super Admin");

    const res = await request(adminApp)
      .get("/api/jobs")
      .query({ search: "55512345" })
      .set(bearer(token));

    expect(res.status).toBe(200);
    expect(res.body.jobs.length).toBe(1);
    expect(res.body.jobs[0].clientName).toBe("Ahmed Ali");
  });

  test("name prefix matches case-insensitively", async () => {
    await seedJobWithPhone("+97450000001", "Ahmed Hassan");
    const token = adminToken("Super Admin");

    const res = await request(adminApp)
      .get("/api/jobs")
      .query({ search: "ahmed" })
      .set(bearer(token));

    expect(res.status).toBe(200);
    expect(res.body.jobs.some((j) => j.clientName === "Ahmed Hassan")).toBe(true);
  });

  test("regex metacharacters are treated literally", async () => {
    await seedJobWithPhone("+97450000002", "a+b(test");
    const token = adminToken("Super Admin");

    const res = await request(adminApp)
      .get("/api/jobs")
      .query({ search: "a+b(" })
      .set(bearer(token));

    expect(res.status).toBe(200);
    expect(res.body.jobs.length).toBe(1);
  });

  test("leads phone prefix search works", async () => {
    await seedLeadWithPhone("5559 8765", "Sara");
    const token = adminToken("Super Admin");

    const res = await request(adminApp)
      .get("/api/leads")
      .query({ search: "55598765" })
      .set(bearer(token));

    expect(res.status).toBe(200);
    expect(res.body.leads.length).toBe(1);
    expect(res.body.leads[0].clientName).toBe("Sara");
  });
});
