const { Technician } = require("../../clicks-shared/models");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const {
  connectSocket,
  waitForEvent,
  expectNoEvent,
  listenServer,
  closeServer,
  disconnectAll,
} = require("../helpers/socket");
const {
  seedCustomer,
  seedCustomerJob,
  seedTechnician,
  seedAdmin,
  JOB_LAT,
  JOB_LNG,
} = require("../helpers/seed");
const { adminToken, technicianToken, customerToken } = require("../helpers/tokens");
const {
  resetTechnicianLocationWriteStateForTests,
} = require("../../clicks-shared/utils/technicianLocationWrite");

let server;
let baseUrl;
const openSockets = [];

beforeAll(async () => {
  await connectTestDb();
  const { createTechAppWithSocket } = require("../../clicks-customer-tech-api/src/createApp");
  ({ server } = await createTechAppWithSocket());
  ({ baseUrl } = await listenServer(server));
});

afterAll(async () => {
  disconnectAll(openSockets);
  await closeServer(server);
  await disconnectTestDb();
});

beforeEach(async () => {
  resetTechnicianLocationWriteStateForTests();
  await clearCollections();
});

function trackSocket(socket) {
  openSockets.push(socket);
  return socket;
}

function waitForAdminLocation(socket, ms = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("technicianLocationUpdate", onUpdate);
      socket.off("technicianLocationBatch", onBatch);
      reject(new Error(`Timeout waiting for admin location after ${ms}ms`));
    }, ms);

    const finish = (payload) => {
      clearTimeout(timer);
      socket.off("technicianLocationUpdate", onUpdate);
      socket.off("technicianLocationBatch", onBatch);
      resolve(payload);
    };

    const onUpdate = (data) => finish(data);
    const onBatch = ({ updates }) => {
      if (Array.isArray(updates) && updates.length) {
        finish(updates[updates.length - 1]);
      }
    };

    socket.on("technicianLocationUpdate", onUpdate);
    socket.on("technicianLocationBatch", onBatch);
  });
}

async function connectAndRegister({ namespace, token }) {
  const socket = trackSocket(
    await connectSocket({ baseUrl, namespace, token })
  );
  socket.emit("register");
  // Technician location/presence is scoped to admins who opt in, exactly as
  // the Live Map page does on connect.
  if (namespace === "/admin") socket.emit("joinLiveMap");
  await new Promise((r) => setTimeout(r, 50));
  return socket;
}

describe("Socket reconnect + job-scoped location delivery", () => {
  test("technician reconnect re-joins room; location reaches admin and assigned customer only", async () => {
    const customer = await seedCustomer();
    const tech = await seedTechnician({
      currentLocation: {
        type: "Point",
        coordinates: [JOB_LNG, JOB_LAT],
      },
    });
    const otherTech = await seedTechnician({
      email: `other-tech-${Date.now()}@test.local`,
      phone: `+974556${String(Date.now()).slice(-6)}`,
    });
    const job = await seedCustomerJob({ customer, technician: tech });
    await seedCustomerJob({
      customer: await seedCustomer({
        email: `other-customer-${Date.now()}@test.local`,
        phone: `+974501${String(Date.now()).slice(-6)}`,
      }),
      technician: otherTech,
    });

    await seedAdmin();
    const adminSocket = await connectAndRegister({
      namespace: "/admin",
      token: adminToken("Super Admin"),
    });
    const customerSocket = await connectAndRegister({
      namespace: "/customer",
      token: customerToken(customer._id),
    });

    let techSocket = await connectAndRegister({
      namespace: "/technician",
      token: technicianToken(tech._id),
    });

    const lat1 = JOB_LAT + 0.001;
    const lng1 = JOB_LNG + 0.001;
    const adminUpdate1Promise = waitForAdminLocation(adminSocket, 15000);
    const customerUpdate1Promise = waitForEvent(
      customerSocket,
      "locationUpdate",
      15000
    );
    techSocket.emit("updateLocation", {
      latitude: lat1,
      longitude: lng1,
      job_id: String(job._id),
    });

    const adminUpdate1 = await adminUpdate1Promise;
    expect(String(adminUpdate1.technician_id)).toBe(String(tech._id));
    expect(adminUpdate1.latitude).toBeCloseTo(lat1, 4);
    expect(adminUpdate1.longitude).toBeCloseTo(lng1, 4);

    const customerUpdate1 = await customerUpdate1Promise;
    expect(String(customerUpdate1.job_id)).toBe(String(job._id));

    const techDoc1 = await Technician.findById(tech._id);
    expect(techDoc1.lastLocationAt).toBeTruthy();
    expect(techDoc1.currentLocation.coordinates[1]).toBeCloseTo(lat1, 4);

    techSocket.disconnect();
    await new Promise((r) => setTimeout(r, 100));

    techSocket = await connectAndRegister({
      namespace: "/technician",
      token: technicianToken(tech._id),
    });

    await new Promise((r) => setTimeout(r, 3200));

    const lat2 = JOB_LAT + 0.002;
    const lng2 = JOB_LNG + 0.002;
    const adminUpdate2Promise = waitForAdminLocation(adminSocket, 15000);
    const customerUpdate2Promise = waitForEvent(
      customerSocket,
      "locationUpdate",
      15000
    );
    techSocket.emit("updateLocation", {
      latitude: lat2,
      longitude: lng2,
      job_id: String(job._id),
    });

    const adminUpdate2 = await adminUpdate2Promise;
    expect(adminUpdate2.latitude).toBeCloseTo(lat2, 4);

    const customerUpdate2 = await customerUpdate2Promise;
    expect(customerUpdate2.latitude).toBeCloseTo(lat2, 4);

    const wrongTechSocket = await connectAndRegister({
      namespace: "/technician",
      token: technicianToken(otherTech._id),
    });
    wrongTechSocket.emit("updateLocation", {
      latitude: JOB_LAT,
      longitude: JOB_LNG,
      job_id: String(job._id),
    });

    await expectNoEvent(customerSocket, "locationUpdate", 2500);
  });

  test("small GPS jitter is ignored; large move still updates", async () => {
    const customer = await seedCustomer();
    const tech = await seedTechnician({
      currentLocation: {
        type: "Point",
        coordinates: [JOB_LNG, JOB_LAT],
      },
    });
    const job = await seedCustomerJob({ customer, technician: tech });

    await seedAdmin();
    const adminSocket = await connectAndRegister({
      namespace: "/admin",
      token: adminToken("Super Admin"),
    });
    const techSocket = await connectAndRegister({
      namespace: "/technician",
      token: technicianToken(tech._id),
    });

    const lat1 = JOB_LAT + 0.001;
    const lng1 = JOB_LNG + 0.001;
    techSocket.emit("updateLocation", {
      latitude: lat1,
      longitude: lng1,
      job_id: String(job._id),
    });

    await waitForAdminLocation(adminSocket, 15000);

    const jitterLat = lat1 + 0.00004; // ~4.4 m — below 15 m gate
    techSocket.emit("updateLocation", {
      latitude: jitterLat,
      longitude: lng1,
      job_id: String(job._id),
    });

    await new Promise((r) => setTimeout(r, 500));
    const afterJitter = await Technician.findById(tech._id);
    expect(afterJitter.currentLocation.coordinates[1]).toBeCloseTo(lat1, 4);
    expect(afterJitter.currentLocation.coordinates[0]).toBeCloseTo(lng1, 4);

    await new Promise((r) => setTimeout(r, 3200));

    const lat2 = lat1 + 0.0002; // ~22 m — above gate
    techSocket.emit("updateLocation", {
      latitude: lat2,
      longitude: lng1,
      job_id: String(job._id),
    });

    const adminUpdate2 = await waitForAdminLocation(adminSocket, 15000);
    expect(adminUpdate2.latitude).toBeCloseTo(lat2, 4);

    const techDoc2 = await Technician.findById(tech._id);
    expect(techDoc2.currentLocation.coordinates[1]).toBeCloseTo(lat2, 4);
  });
});

describe("auto-Offline is undone by a reconnect", () => {
  test("a technician swept Offline during a signal gap is restored on register", async () => {
    // The server inferred Offline (socket gone / heartbeat stale) — the
    // technician never chose it, so autoOfflineAt is stamped.
    const tech = await seedTechnician({
      currentStatus: "Offline",
      autoOfflineAt: new Date(Date.now() - 90 * 1000),
    });

    await seedAdmin();
    const adminSocket = await connectAndRegister({
      namespace: "/admin",
      token: adminToken("Super Admin"),
    });
    const presence = waitForEvent(adminSocket, "technicianOnline", 15000);

    await connectAndRegister({
      namespace: "/technician",
      token: technicianToken(tech._id),
    });

    const payload = await presence;
    expect(String(payload.technician_id)).toBe(tech._id.toString());

    const after = await Technician.findById(tech._id).select(
      "currentStatus autoOfflineAt"
    );
    expect(after.currentStatus).toBe("Online");
    expect(after.autoOfflineAt).toBeNull();
  });

  test("a deliberate Offline is NOT resurrected by a reconnect", async () => {
    // The technician toggled Offline themselves, so no autoOfflineAt stamp.
    const tech = await seedTechnician({
      currentStatus: "Offline",
      autoOfflineAt: null,
    });

    await seedAdmin();
    const adminSocket = await connectAndRegister({
      namespace: "/admin",
      token: adminToken("Super Admin"),
    });

    await connectAndRegister({
      namespace: "/technician",
      token: technicianToken(tech._id),
    });

    await expectNoEvent(adminSocket, "technicianOnline", 1500);

    const after = await Technician.findById(tech._id).select("currentStatus");
    expect(after.currentStatus).toBe("Offline");
  });
});

describe("technician socket enforces account state", () => {
  test("a deactivated technician cannot open the socket", async () => {
    const tech = await seedTechnician({ isActive: false });
    await expect(
      connectSocket({
        baseUrl,
        namespace: "/technician",
        token: technicianToken(tech._id),
      })
    ).rejects.toThrow(/Unauthorized/i);
  });

  test("an unapproved technician cannot open the socket", async () => {
    const tech = await seedTechnician({ applicationStatus: "Pending" });
    await expect(
      connectSocket({
        baseUrl,
        namespace: "/technician",
        token: technicianToken(tech._id),
      })
    ).rejects.toThrow(/Unauthorized/i);
  });

  test("an approved active technician still connects", async () => {
    const tech = await seedTechnician();
    const socket = trackSocket(
      await connectSocket({
        baseUrl,
        namespace: "/technician",
        token: technicianToken(tech._id),
      })
    );
    expect(socket.connected).toBe(true);
  });
});

describe("technician location is scoped to Live Map watchers", () => {
  test("an admin socket that never joins receives no location events", async () => {
    const tech = await seedTechnician({
      currentLocation: { type: "Point", coordinates: [JOB_LNG, JOB_LAT] },
    });
    await seedAdmin();

    // A notification-only admin session (what AdminLayout opens on every page):
    // connects and registers, but never opts into the map feed.
    const bystander = trackSocket(
      await connectSocket({
        baseUrl,
        namespace: "/admin",
        token: adminToken("Super Admin"),
      })
    );
    bystander.emit("register");

    // A real Live Map session.
    const watcher = await connectAndRegister({
      namespace: "/admin",
      token: adminToken("Super Admin"),
    });

    const techSocket = await connectAndRegister({
      namespace: "/technician",
      token: technicianToken(tech._id),
    });

    const watcherGot = waitForAdminLocation(watcher, 15000);
    const bystanderQuiet = expectNoEvent(bystander, "technicianLocationBatch", 4000);

    techSocket.emit("updateLocation", {
      latitude: JOB_LAT + 0.002,
      longitude: JOB_LNG + 0.002,
    });

    await watcherGot;
    await bystanderQuiet;
  });
});

describe("an Online technician always reaches the Live Map", () => {
  const TWELVE_HOURS_AGO = () => new Date(Date.now() - 12 * 60 * 60 * 1000);

  test("a parked technician a few metres from the stored pin still checks in", async () => {
    // Where the van was left at the end of the last shift.
    const tech = await seedTechnician({
      currentLocation: { type: "Point", coordinates: [JOB_LNG, JOB_LAT] },
      lastLocationAt: TWELVE_HOURS_AGO(),
      lastHeartbeatAt: TWELVE_HOURS_AGO(),
    });
    await seedAdmin();

    const watcher = await connectAndRegister({
      namespace: "/admin",
      token: adminToken("Super Admin"),
    });
    const techSocket = await connectAndRegister({
      namespace: "/technician",
      token: technicianToken(tech._id),
    });

    // First fix of the new shift: ~5.5 m off the stored point (GPS noise).
    // This used to be dropped as jitter, every 12 s, until the van drove 15 m.
    const fixTime = new Date().toISOString();
    const seen = [];
    watcher.on("technicianLocationBatch", ({ updates }) => seen.push(...(updates || [])));
    techSocket.emit("updateLocation", {
      latitude: JOB_LAT + 0.00005,
      longitude: JOB_LNG,
      accuracy: 8,
      fix_time: fixTime,
    });

    // The GPS time only moves when the technician's own update is accepted
    // (the socket-register refresh stamps the heartbeat alone).
    const deadline = Date.now() + 8000;
    let fresh;
    while (Date.now() < deadline) {
      fresh = await Technician.findById(tech._id).lean();
      if (new Date(fresh.lastLocationAt).toISOString() === fixTime) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(new Date(fresh.lastLocationAt).toISOString()).toBe(fixTime);
    expect(Date.now() - new Date(fresh.lastHeartbeatAt).getTime()).toBeLessThan(10000);
    // The pin itself has not moved.
    expect(fresh.currentLocation.coordinates).toEqual([JOB_LNG, JOB_LAT]);

    // ...and the admin is told, with the stored coordinates.
    const waitUntil = Date.now() + 6000;
    while (
      Date.now() < waitUntil &&
      !seen.some((u) => u.lastLocationAt === fixTime)
    ) {
      await new Promise((r) => setTimeout(r, 100));
    }
    const delivered = seen.find((u) => u.lastLocationAt === fixTime);
    expect(delivered).toBeTruthy();
    expect(delivered.latitude).toBe(JOB_LAT);
    expect(delivered.presenceStale).toBe(false);
  });

  test("going Online stamps the heartbeat, so the shift does not start as disconnected", async () => {
    const request = require("supertest");
    const tech = await seedTechnician({
      currentStatus: "Offline",
      currentLocation: { type: "Point", coordinates: [JOB_LNG, JOB_LAT] },
      lastLocationAt: TWELVE_HOURS_AGO(),
      lastHeartbeatAt: TWELVE_HOURS_AGO(),
    });
    await seedAdmin();
    const watcher = await connectAndRegister({
      namespace: "/admin",
      token: adminToken("Super Admin"),
    });
    const announced = waitForEvent(watcher, "technicianOnline", 8000);

    const res = await request(server)
      .patch("/api/technicians/status")
      .set("Authorization", `Bearer ${technicianToken(tech._id)}`)
      .send({ status: "Online" });
    expect(res.status).toBe(200);

    const payload = await announced;
    expect(payload.technician_id).toBe(String(tech._id));
    expect(payload.presenceStale).toBe(false);

    const fresh = await Technician.findById(tech._id).lean();
    expect(Date.now() - new Date(fresh.lastHeartbeatAt).getTime()).toBeLessThan(10000);
    // The GPS time is untouched: no position was measured.
    expect(Date.now() - new Date(fresh.lastLocationAt).getTime()).toBeGreaterThan(60 * 60 * 1000);
  });

  test("an admin who reconnects must rejoin the feed; once it does, events resume", async () => {
    const tech = await seedTechnician({
      currentLocation: { type: "Point", coordinates: [JOB_LNG, JOB_LAT] },
    });
    await seedAdmin();
    const watcher = await connectAndRegister({
      namespace: "/admin",
      token: adminToken("Super Admin"),
    });
    const techSocket = await connectAndRegister({
      namespace: "/technician",
      token: technicianToken(tech._id),
    });

    // Drop and re-establish the admin connection (deploy, network blip, sleep).
    watcher.disconnect();
    const reconnected = waitForEvent(watcher, "connect", 8000);
    watcher.connect();
    await reconnected;
    watcher.emit("register");
    await new Promise((r) => setTimeout(r, 2500)); // let any pending batch drain

    // Rooms belong to the old connection. Without a fresh join: silence.
    const silent = expectNoEvent(watcher, "technicianLocationBatch", 4000);
    techSocket.emit("updateLocation", {
      latitude: JOB_LAT + 0.002,
      longitude: JOB_LNG + 0.002,
    });
    await silent;

    // What the Live Map now does on every connect.
    watcher.emit("joinLiveMap");
    await new Promise((r) => setTimeout(r, 100));
    const resumed = waitForAdminLocation(watcher, 10000);
    techSocket.emit("updateLocation", {
      latitude: JOB_LAT + 0.004,
      longitude: JOB_LNG + 0.004,
    });
    const update = await resumed;
    expect(update.technician_id).toBe(String(tech._id));
  });
});
