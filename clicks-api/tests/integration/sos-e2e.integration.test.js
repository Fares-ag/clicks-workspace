const { SOSRequest } = require("../../clicks-shared/models");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const {
  connectSocket,
  waitForEvent,
  listenServer,
  closeServer,
  disconnectAll,
} = require("../helpers/socket");
const { seedCustomer, seedTechnician, seedAdmin, JOB_LAT, JOB_LNG } = require("../helpers/seed");
const { adminToken, customerToken } = require("../helpers/tokens");

let server;
let baseUrl;
const openSockets = [];

beforeAll(async () => {
  await connectTestDb();
  await SOSRequest.init();
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
  await clearCollections();
});

function trackSocket(socket) {
  openSockets.push(socket);
  return socket;
}

async function connectAndRegister({ namespace, token }) {
  const socket = trackSocket(
    await connectSocket({ baseUrl, namespace, token })
  );
  socket.emit("register");
  await new Promise((r) => setTimeout(r, 50));
  return socket;
}

describe("SOS end-to-end (realtime)", () => {
  test("createSOS broadcasts to admin; claim moves SOS to in_call and notifies customer", async () => {
    const customer = await seedCustomer();
    await seedTechnician({
      currentLocation: {
        type: "Point",
        coordinates: [JOB_LNG, JOB_LAT],
      },
      lastLocationAt: new Date(),
    });

    const adminId = "507f1f77bcf86cd799439012";
    // /admin namespace now verifies the JWT subject is a real active Admin.
    await seedAdmin({ _id: adminId });
    const customerSocket = await connectAndRegister({
      namespace: "/customer",
      token: customerToken(customer._id),
    });
    const adminSocket = await connectAndRegister({
      namespace: "/admin",
      token: adminToken("Super Admin", adminId),
    });

    const sosLat = JOB_LAT;
    const sosLng = JOB_LNG;

    customerSocket.emit("createSOS", {
      latitude: sosLat,
      longitude: sosLng,
      skip_vehicle: true,
    });

    const [sosCreated, newSOSRequest] = await Promise.all([
      waitForEvent(customerSocket, "sosCreated", 15000),
      waitForEvent(adminSocket, "newSOSRequest", 15000),
    ]);

    const sosId = String(sosCreated.sos_id);
    expect(sosCreated.status).toBe("pending");
    expect(String(newSOSRequest.sos_id)).toBe(sosId);
    expect(newSOSRequest.status).toBe("pending");
    expect(String(newSOSRequest.customer_id)).toBe(String(customer._id));

    const doc = await SOSRequest.findById(sosId);
    expect(doc).not.toBeNull();
    expect(doc.status).toBe("pending");

    adminSocket.emit("sosAccepted", {
      sos_id: sosId,
      customer_id: String(customer._id),
    });

    const sosInCall = await waitForEvent(customerSocket, "sosInCall", 15000);
    expect(String(sosInCall.sos_id)).toBe(sosId);
    expect(sosInCall.status).toBe("in_call");

    const updated = await SOSRequest.findById(sosId);
    expect(updated.status).toBe("in_call");
    expect(String(updated.claimed_by)).toBe(adminId);
  });

  test("createSOS acks with the SOS and emits sosCreated to the customer's room", async () => {
    const customer = await seedCustomer();
    const deviceA = await connectAndRegister({
      namespace: "/customer",
      token: customerToken(customer._id),
    });
    const deviceB = await connectAndRegister({
      namespace: "/customer",
      token: customerToken(customer._id),
    });

    const roomEvent = waitForEvent(deviceB, "sosCreated", 10000);
    const ack = await deviceA
      .timeout(10000)
      .emitWithAck("createSOS", {
        latitude: JOB_LAT,
        longitude: JOB_LNG,
        skip_vehicle: true,
        client_request_id: "req-ack-1",
        accuracy_m: 18,
        fix_time: new Date().toISOString(),
        location_source: "gps",
      });

    expect(ack.ok).toBe(true);
    expect(ack.status).toBe("pending");
    const fromRoom = await roomEvent;
    expect(String(fromRoom.sos_id)).toBe(String(ack.sos_id));

    const doc = await SOSRequest.findById(ack.sos_id);
    expect(doc.client_request_id).toBe("req-ack-1");
    expect(doc.accuracy_m).toBe(18);
    expect(doc.location_source).toBe("gps");
    expect(doc.fix_time).toBeInstanceOf(Date);
  });

  test("duplicate create with the same client_request_id resolves to the same SOS", async () => {
    const customer = await seedCustomer();
    const s1 = await connectAndRegister({
      namespace: "/customer",
      token: customerToken(customer._id),
    });
    const s2 = await connectAndRegister({
      namespace: "/customer",
      token: customerToken(customer._id),
    });

    const payload = {
      latitude: JOB_LAT,
      longitude: JOB_LNG,
      skip_vehicle: true,
      client_request_id: "replay-123",
    };
    const [a, b] = await Promise.all([
      s1.timeout(10000).emitWithAck("createSOS", payload),
      s2.timeout(10000).emitWithAck("createSOS", payload),
    ]);

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(String(a.sos_id)).toBe(String(b.sos_id));
    expect(await SOSRequest.countDocuments({ customer_id: customer._id })).toBe(1);

    // A replay after reconnect (same key) is the same request, not a new one.
    const replay = await s1.timeout(10000).emitWithAck("createSOS", payload);
    expect(replay.ok).toBe(true);
    expect(replay.duplicate).toBe(true);
    expect(String(replay.sos_id)).toBe(String(a.sos_id));
  });

  test("a second, different SOS while one is live returns SOS_ALREADY_ACTIVE with its id", async () => {
    const customer = await seedCustomer();
    const sock = await connectAndRegister({
      namespace: "/customer",
      token: customerToken(customer._id),
    });
    const first = await sock.timeout(10000).emitWithAck("createSOS", {
      latitude: JOB_LAT,
      longitude: JOB_LNG,
      skip_vehicle: true,
      client_request_id: "first",
    });
    const second = await sock.timeout(10000).emitWithAck("createSOS", {
      latitude: JOB_LAT,
      longitude: JOB_LNG,
      skip_vehicle: true,
      client_request_id: "second",
    });
    expect(second.ok).toBe(false);
    expect(second.code).toBe("SOS_ALREADY_ACTIVE");
    expect(String(second.sos_id)).toBe(String(first.sos_id));
  });

  test("unique partial index refuses a second live SOS even without the read guard", async () => {
    const customer = await seedCustomer();
    await SOSRequest.init();
    await SOSRequest.create({
      customer_id: customer._id,
      location: { type: "Point", coordinates: [JOB_LNG, JOB_LAT] },
      status: "pending",
    });
    await expect(
      SOSRequest.create({
        customer_id: customer._id,
        location: { type: "Point", coordinates: [JOB_LNG, JOB_LAT] },
        status: "in_call",
      })
    ).rejects.toMatchObject({ code: 11000 });
    // Terminal SOS rows are outside the partial filter.
    await expect(
      SOSRequest.create({
        customer_id: customer._id,
        location: { type: "Point", coordinates: [JOB_LNG, JOB_LAT] },
        status: "cancelled",
      })
    ).resolves.toBeTruthy();
  });

  test("throttle: a 4th SOS inside 10 minutes is refused (scenario 36)", async () => {
    const customer = await seedCustomer();
    for (let i = 0; i < 3; i += 1) {
      await SOSRequest.create({
        customer_id: customer._id,
        location: { type: "Point", coordinates: [JOB_LNG, JOB_LAT] },
        status: "cancelled",
      });
    }
    const sock = await connectAndRegister({
      namespace: "/customer",
      token: customerToken(customer._id),
    });
    const res = await sock.timeout(10000).emitWithAck("createSOS", {
      latitude: JOB_LAT,
      longitude: JOB_LNG,
      skip_vehicle: true,
      client_request_id: "throttled",
    });
    expect(res.ok).toBe(false);
    expect(res.code).toBe("SOS_THROTTLED");
  });

  test("cancelSOS after a job exists fails with SOS_JOB_CREATED", async () => {
    const customer = await seedCustomer();
    const sos = await SOSRequest.create({
      customer_id: customer._id,
      location: { type: "Point", coordinates: [JOB_LNG, JOB_LAT] },
      status: "accepted",
      job_id: "507f1f77bcf86cd7994390aa",
    });
    const sock = await connectAndRegister({
      namespace: "/customer",
      token: customerToken(customer._id),
    });
    const res = await sock.timeout(10000).emitWithAck("cancelSOS", {
      sos_id: String(sos._id),
      reason: "no_longer_needed",
    });
    expect(res.ok).toBe(false);
    expect(res.code).toBe("SOS_JOB_CREATED");
    expect(res.job_id).toBe("507f1f77bcf86cd7994390aa");
    expect((await SOSRequest.findById(sos._id)).status).toBe("accepted");
  });

  test("socket connection without valid JWT is rejected", async () => {
    await expect(
      connectSocket({ baseUrl, namespace: "/customer", token: "not-a-valid-jwt" })
    ).rejects.toThrow(/Unauthorized|jwt/i);
  });

  test("socket connection without token is rejected", async () => {
    await expect(
      connectSocket({ baseUrl, namespace: "/customer", token: undefined })
    ).rejects.toThrow(/Unauthorized/i);
  });
});
