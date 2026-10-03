const request = require("supertest");
const mongoose = require("mongoose");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const { adminToken, bearer } = require("../helpers/tokens");
const { seedAdmin } = require("../helpers/seed");
const Notification = require("../../clicks-shared/models/Notification");
const {
  recordAdminNotification,
} = require("../../clicks-customer-tech-api/src/services/notificationRecordService");

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
  await seedAdmin();
});

describe("Admin notifications API", () => {
  test("recordAdminNotification creates a broadcast admin row", async () => {
    await recordAdminNotification({
      type: "sos.new",
      title: "New SOS request",
      body: "SOS from Test Customer",
      data: { sos_id: "abc123" },
    });

    const count = await Notification.countDocuments({ audience: "admin" });
    expect(count).toBe(1);
  });

  test("unread count and mark-read are scoped per admin", async () => {
    const secondAdminId = new mongoose.Types.ObjectId();
    await seedAdmin({ _id: secondAdminId, role: "Job Dispatcher" });

    await Notification.create({
      audience: "admin",
      type: "lead.new",
      title: "New business lead",
      body: "Lead submitted",
      data: { lead_id: "lead1" },
      read_by: [],
    });

    const tokenA = adminToken("Super Admin", "507f1f77bcf86cd799439011");
    const tokenB = adminToken("Job Dispatcher", String(secondAdminId));

    const unreadA = await request(adminApp)
      .get("/api/notifications/unread-count")
      .set(bearer(tokenA));
    expect(unreadA.status).toBe(200);
    expect(unreadA.body.count).toBe(1);

    const unreadB = await request(adminApp)
      .get("/api/notifications/unread-count")
      .set(bearer(tokenB));
    expect(unreadB.status).toBe(200);
    expect(unreadB.body.count).toBe(1);

    const markA = await request(adminApp)
      .post("/api/notifications/mark-read")
      .set(bearer(tokenA))
      .send({ all: true });
    expect(markA.status).toBe(200);

    const afterA = await request(adminApp)
      .get("/api/notifications/unread-count")
      .set(bearer(tokenA));
    expect(afterA.body.count).toBe(0);

    const afterB = await request(adminApp)
      .get("/api/notifications/unread-count")
      .set(bearer(tokenB));
    expect(afterB.body.count).toBe(1);

    const markB = await request(adminApp)
      .post("/api/notifications/mark-read")
      .set(bearer(tokenB))
      .send({ all: true });
    expect(markB.status).toBe(200);

    const finalB = await request(adminApp)
      .get("/api/notifications/unread-count")
      .set(bearer(tokenB));
    expect(finalB.body.count).toBe(0);
  });

  test("list returns newest notifications with read flag for caller", async () => {
    const doc = await Notification.create({
      audience: "admin",
      type: "job.hold_request",
      title: "Hold request pending",
      body: "Review hold request",
      data: { job_id: "job1" },
      read_by: [],
    });

    const token = adminToken("Super Admin");
    const list = await request(adminApp)
      .get("/api/notifications")
      .set(bearer(token));

    expect(list.status).toBe(200);
    expect(list.body.notifications).toHaveLength(1);
    expect(list.body.notifications[0].id).toBe(String(doc._id));
    expect(list.body.notifications[0].read).toBe(false);
    expect(list.body.notifications[0].data.job_id).toBe("job1");
  });

  test("Notification schema declares TTL index on createdAt", () => {
    const ttlIndex = Notification.schema.indexes().find(
      ([fields, options]) =>
        fields.createdAt === 1 && options?.expireAfterSeconds === 90 * 24 * 60 * 60
    );
    expect(ttlIndex).toBeTruthy();
  });
});
