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
