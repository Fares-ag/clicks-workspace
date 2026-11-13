const request = require("supertest");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const { adminToken, bearer } = require("../helpers/tokens");
const {
  seedAdmin,
  seedTechnician,
  seedCustomerJob,
  JOB_LAT,
  JOB_LNG,
} = require("../helpers/seed");
const { Technician } = require("../../clicks-shared/models");
const AdminAuditLog = require("../../clicks-shared/models/AdminAuditLog");
const { invalidateTechnicianRoster } = require("../../clicks-shared/utils/adminLookups");

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
  invalidateTechnicianRoster();
  await seedAdmin();
});

const auth = () => bearer(adminToken("Super Admin"));
const setActive = (id, body) =>
  request(adminApp).patch(`/api/technicians/${id}/toggle-active`).set(auth()).send(body);
const liveMapIds = async () => {
  const res = await request(adminApp).get("/api/technicians/live-map").set(auth());
  return res.body.technicians.map((t) => String(t._id));
};
const listRow = async (id) => {
  const res = await request(adminApp).get("/api/technicians?limit=100").set(auth());
  return res.body.technicians.find((t) => String(t._id) === String(id));
};

describe("Technician activation switch", () => {
  test("stating the wanted value is safe to repeat (a second click cannot undo the first)", async () => {
    const tech = await seedTechnician({ currentStatus: "Offline", isActive: false });

    const first = await setActive(tech._id, { isActive: true });
    expect(first.status).toBe(200);
    expect(first.body.technician.isActive).toBe(true);

    const second = await setActive(tech._id, { isActive: true });
    expect(second.status).toBe(200);
    expect(second.body.unchanged).toBe(true);

    expect((await Technician.findById(tech._id).lean()).isActive).toBe(true);
  });

  test("a request with no body still flips, for clients that have not updated", async () => {
    const tech = await seedTechnician({ currentStatus: "Offline" });
    const res = await setActive(tech._id, undefined);
    expect(res.status).toBe(200);
    expect((await Technician.findById(tech._id).lean()).isActive).toBe(false);
  });

  test("deactivating a technician who is on a job is refused unless forced", async () => {
    const tech = await seedTechnician({
      currentStatus: "On Job",
      currentLocation: { type: "Point", coordinates: [JOB_LNG, JOB_LAT] },
    });
    await seedCustomerJob({ technician: tech, jobStatus: "in_progress" });

    const refused = await setActive(tech._id, { isActive: false });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("TECHNICIAN_HAS_ACTIVE_JOB");
    expect((await Technician.findById(tech._id).lean()).isActive).toBe(true);
    // Still on the map.
    expect(await liveMapIds()).toEqual([String(tech._id)]);

    const forced = await setActive(tech._id, { isActive: false, force: true });
    expect(forced.status).toBe(200);
    expect((await Technician.findById(tech._id).lean()).isActive).toBe(false);
  });

  test("reactivating puts a working technician straight back on the Live Map and in the list", async () => {
    const tech = await seedTechnician({
      currentStatus: "On Job",
      isActive: false,
      currentLocation: { type: "Point", coordinates: [JOB_LNG, JOB_LAT] },
    });
    // Prime both caches while they are still deactivated.
    expect(await liveMapIds()).toEqual([]);
    expect((await listRow(tech._id)).isActive).toBe(false);

    const res = await setActive(tech._id, { isActive: true });
    expect(res.status).toBe(200);

    // No waiting for a cache to expire.
    expect(await liveMapIds()).toEqual([String(tech._id)]);
    expect((await listRow(tech._id)).isActive).toBe(true);
  });

  test("every change is written to the admin audit log", async () => {
    const tech = await seedTechnician({ currentStatus: "Offline" });
    await setActive(tech._id, { isActive: false });
    await setActive(tech._id, { isActive: true });
    await setActive(tech._id, { isActive: true }); // unchanged: not logged

    const rows = await AdminAuditLog.find({ entity_id: tech._id }).sort({ _id: 1 }).lean();
    expect(rows.map((r) => r.action)).toEqual([
      "technician.deactivate",
      "technician.activate",
    ]);
    expect(rows[0].changes.isActive).toEqual({ from: true, to: false });
  });
});
