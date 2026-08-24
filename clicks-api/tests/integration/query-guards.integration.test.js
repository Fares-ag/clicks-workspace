const request = require("supertest");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const { adminToken, bearer } = require("../helpers/tokens");
const PlatformStats = require("../../clicks-shared/models/PlatformStats");
const Job = require("../../clicks-shared/models/Job");
const { seedAdmin } = require("../helpers/seed");

let adminApp;
const recorded = { find: [], aggregate: [], count: [] };

beforeAll(async () => {
  await connectTestDb();
  adminApp = require("../../clicks-admin-api/src/createApp").createAdminApp();

  Job.schema.pre("find", function () {
    recorded.find.push(this.getFilter());
  });
  Job.schema.pre("aggregate", function () {
    recorded.aggregate.push(this.pipeline());
  });
  Job.schema.pre("countDocuments", function () {
    recorded.count.push(this.getFilter());
  });
});

afterAll(async () => {
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearCollections();
  // requireRoles now confirms the caller is still an active Admin document,
  // so an admin token needs a matching record — as it always does in production.
  await seedAdmin();
  recorded.find.length = 0;
  recorded.aggregate.length = 0;
  recorded.count.length = 0;
});

describe("Query guards", () => {
  test("admin getJobs returns paginated response", async () => {
    const res = await request(adminApp)
      .get("/api/jobs?limit=10")
      .set(bearer(adminToken("Super Admin")));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.jobs)).toBe(true);
    expect(res.body.jobs.length).toBeLessThanOrEqual(10);
  });

  test("warm dashboard skips Job.aggregate", async () => {
    await PlatformStats.create({
      key: "dashboard_summary",
      computed_at: new Date(),
      value: {
        earnings: { totalAllTime: 1, today: 1, yesterday: 1, currency: "QAR" },
      },
    });
    recorded.aggregate.length = 0;
    const res = await request(adminApp)
      .get("/api/dashboard/summary")
      .set(bearer(adminToken("Super Admin")));
    expect(res.status).toBe(200);
    expect(recorded.aggregate.length).toBe(0);
  });
});
