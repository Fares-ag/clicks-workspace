const request = require("supertest");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const { adminToken, bearer } = require("../helpers/tokens");
const { seedArrivedJob, seedAdmin } = require("../helpers/seed");

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

describe("Admin RBAC", () => {
  test('Job Dispatcher gets 403 on DELETE /api/jobs/:id and 200 on GET /api/jobs', async () => {
    const job = await seedArrivedJob();
    const dispatcherToken = adminToken("Job Dispatcher");

    const listRes = await request(adminApp)
      .get("/api/jobs")
      .set(bearer(dispatcherToken));
    expect(listRes.status).toBe(200);

    const deleteRes = await request(adminApp)
      .delete(`/api/jobs/${job._id}`)
      .set(bearer(dispatcherToken));
    expect(deleteRes.status).toBe(403);
    expect(deleteRes.body.message).toMatch(/Forbidden/i);
  });

  test("technician-role JWT gets 403 on both GET and DELETE /api/jobs", async () => {
    const job = await seedArrivedJob();
    const techJwt = adminToken("technician");

    const listRes = await request(adminApp)
      .get("/api/jobs")
      .set(bearer(techJwt));
    expect(listRes.status).toBe(403);

    const deleteRes = await request(adminApp)
      .delete(`/api/jobs/${job._id}`)
      .set(bearer(techJwt));
    expect(deleteRes.status).toBe(403);
  });
});

describe("Admin account state is enforced, not just the token claim", () => {
  test("a deactivated admin is refused even with a valid unexpired token", async () => {
    const { Admin } = require("../../clicks-shared/models");
    const token = adminToken("Super Admin");

    // Same token, still perfectly valid and unexpired.
    const before = await request(adminApp).get("/api/jobs").set(bearer(token));
    expect(before.status).toBe(200);

    await Admin.updateOne(
      { _id: "507f1f77bcf86cd799439011" },
      { isActive: false }
    );

    const after = await request(adminApp).get("/api/jobs").set(bearer(token));
    expect(after.status).toBe(403);
  });

  test("a token whose admin record no longer exists is refused", async () => {
    const { Admin } = require("../../clicks-shared/models");
    const token = adminToken("Super Admin");
    await Admin.deleteMany({});

    const res = await request(adminApp).get("/api/jobs").set(bearer(token));
    expect(res.status).toBe(403);
  });
});
