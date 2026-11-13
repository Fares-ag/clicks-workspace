const request = require("supertest");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const { adminToken, bearer } = require("../helpers/tokens");
const { seedAdmin, seedTechnician, JOB_LAT, JOB_LNG } = require("../helpers/seed");
const { Technician } = require("../../clicks-shared/models");
const { getSlimTechnicianRoster } = require("../../clicks-shared/utils/adminLookups");

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

const liveMap = () =>
  request(adminApp)
    .get("/api/technicians/live-map")
    .set(bearer(adminToken("Super Admin")));

// Longer than the endpoint's 2 s burst memo.
const pastMemo = () => new Promise((r) => setTimeout(r, 2200));

describe("Live Map snapshot reflects the database, not a cached roster", () => {
  test("a heartbeat and a move written by the tech API show up on the next read", async () => {
    const tech = await seedTechnician({
      currentLocation: { type: "Point", coordinates: [JOB_LNG, JOB_LAT] },
      lastLocationAt: new Date(Date.now() - 10 * 60 * 1000),
      lastHeartbeatAt: new Date(Date.now() - 10 * 60 * 1000),
    });
    // Prime the in-process roster the endpoint used to read from.
    await getSlimTechnicianRoster();
    await pastMemo();

    const first = await liveMap();
    expect(first.status).toBe(200);
    expect(first.body.technicians).toHaveLength(1);
    expect(first.body.technicians[0].presenceStale).toBe(true);

    // What the tech API does on every accepted location write.
    const heard = new Date();
    await Technician.updateOne(
      { _id: tech._id },
      {
        "currentLocation.coordinates": [JOB_LNG + 0.01, JOB_LAT + 0.01],
        lastLocationAt: heard,
        lastHeartbeatAt: heard,
      }
    );
    await pastMemo();

    const second = await liveMap();
    const row = second.body.technicians[0];
    expect(row.lastHeartbeatAt).toBe(heard.toISOString());
    expect(row.presenceStale).toBe(false);
    expect(row.location.latitude).toBeCloseTo(JOB_LAT + 0.01, 6);
    expect(row.location.longitude).toBeCloseTo(JOB_LNG + 0.01, 6);
  });

  test("a technician who goes Online appears, and one who goes Offline leaves", async () => {
    const stays = await seedTechnician({
      currentStatus: "Offline",
      currentLocation: { type: "Point", coordinates: [JOB_LNG, JOB_LAT] },
    });
    const leaves = await seedTechnician({
      email: `leaves-${Date.now()}@test.local`,
      phone: "+97455500001",
      currentStatus: "Online",
      currentLocation: { type: "Point", coordinates: [JOB_LNG, JOB_LAT] },
    });
    await getSlimTechnicianRoster();
    await pastMemo();

    const before = await liveMap();
    expect(before.body.technicians.map((t) => String(t._id))).toEqual([String(leaves._id)]);

    await Technician.updateOne({ _id: stays._id }, { currentStatus: "Online" });
    await Technician.updateOne({ _id: leaves._id }, { currentStatus: "Offline" });
    await pastMemo();

    const after = await liveMap();
    expect(after.body.technicians.map((t) => String(t._id))).toEqual([String(stays._id)]);
  });

  test("On Job technicians are listed; deactivated ones are not", async () => {
    const onJob = await seedTechnician({
      currentStatus: "On Job",
      currentLocation: { type: "Point", coordinates: [JOB_LNG, JOB_LAT] },
    });
    await seedTechnician({
      email: `inactive-${Date.now()}@test.local`,
      phone: "+97455500002",
      currentStatus: "Online",
      isActive: false,
    });
    await pastMemo();

    const res = await liveMap();
    expect(res.body.technicians.map((t) => String(t._id))).toEqual([String(onJob._id)]);
    expect(res.body.technicians[0].currentStatus).toBe("On Job");
  });
});
