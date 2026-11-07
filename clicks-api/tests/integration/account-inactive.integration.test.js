/**
 * WS-F item 4 (scenario 14): a blocked customer is refused on REST and on the
 * socket handshake, and an admin block force-disconnects live sockets.
 */
const request = require("supertest");

jest.mock("../../clicks-admin-api/src/utils/techApiNotify", () => ({
  postToTechApi: jest.fn(async () => true),
}));
const { postToTechApi } = require("../../clicks-admin-api/src/utils/techApiNotify");
const jwt = require("../../clicks-admin-api/node_modules/jsonwebtoken");
const { Customer } = require("../../clicks-shared/models");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const {
  connectSocket,
  waitForEvent,
  listenServer,
  closeServer,
  disconnectAll,
} = require("../helpers/socket");
const { seedCustomer, seedAdmin } = require("../helpers/seed");
const { customerToken, adminToken, bearer } = require("../helpers/tokens");

let server;
let baseUrl;
let techApp;
let adminApp;
const openSockets = [];

beforeAll(async () => {
  await connectTestDb();
  const { createTechAppWithSocket } = require("../../clicks-customer-tech-api/src/createApp");
  ({ app: techApp, server } = await createTechAppWithSocket());
  ({ baseUrl } = await listenServer(server));
  adminApp = require("../../clicks-admin-api/src/createApp").createAdminApp();
});

afterAll(async () => {
  disconnectAll(openSockets);
  await closeServer(server);
  await disconnectTestDb();
});

beforeEach(async () => {
  disconnectAll(openSockets.splice(0));
  await clearCollections();
  postToTechApi.mockClear();
});

async function connectCustomer(token) {
  const socket = await connectSocket({ baseUrl, namespace: "/customer", token });
  openSockets.push(socket);
  return socket;
}

describe("REST", () => {
  test("an Inactive customer gets 403 ACCOUNT_INACTIVE", async () => {
    const customer = await seedCustomer({ status: "Inactive" });
    const res = await request(techApp)
      .get("/api/customers/profile")
      .set(bearer(customerToken(customer._id)));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ACCOUNT_INACTIVE");
  });
});

describe("socket handshake", () => {
  test("an active customer connects", async () => {
    const customer = await seedCustomer();
    const socket = await connectCustomer(customerToken(customer._id));
    expect(socket.connected).toBe(true);
  });

  test("a blocked customer is rejected with ACCOUNT_INACTIVE", async () => {
    const customer = await seedCustomer({ status: "Inactive" });
    await expect(connectCustomer(customerToken(customer._id))).rejects.toThrow("ACCOUNT_INACTIVE");
  });

  test("a deleted customer is rejected", async () => {
    const customer = await seedCustomer({ deleted_at: new Date() });
    await expect(connectCustomer(customerToken(customer._id))).rejects.toThrow("ACCOUNT_INACTIVE");
  });

  test("a revoked token (password reset) is rejected", async () => {
    const customer = await seedCustomer({ token_version: 2 });
    const stale = jwt.sign({ id: String(customer._id), role: "customer", tv: 1 }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });
    await expect(connectCustomer(stale)).rejects.toThrow("TOKEN_REVOKED");
  });
});

describe("admin block", () => {
  test("blocking calls the tech API to drop the customer's sockets (audited)", async () => {
    await seedAdmin();
    const customer = await seedCustomer();
    const res = await request(adminApp)
      .put(`/api/customers/${customer._id}`)
      .set(bearer(adminToken("Super Admin")))
      .send({ status: "Inactive" });
    expect(res.status).toBe(200);
    expect((await Customer.findById(customer._id)).status).toBe("Inactive");

    expect(postToTechApi).toHaveBeenCalledWith("/api/customers/internal/disconnect", {
      customer_id: String(customer._id),
    });
  });

  test("an invalid status value is refused", async () => {
    await seedAdmin();
    const customer = await seedCustomer();
    const res = await request(adminApp)
      .put(`/api/customers/${customer._id}`)
      .set(bearer(adminToken("Super Admin")))
      .send({ status: "Banned" });
    expect(res.status).toBe(400);
  });

  test("the internal endpoint disconnects a live customer socket and tells the app why", async () => {
    const customer = await seedCustomer();
    const socket = await connectCustomer(customerToken(customer._id));
    socket.emit("register");
    // Give the server a tick to join the room.
    await new Promise((r) => setTimeout(r, 200));

    const inactive = waitForEvent(socket, "accountInactive", 5000);
    const disconnected = waitForEvent(socket, "disconnect", 5000);
    const res = await request(techApp)
      .post("/api/customers/internal/disconnect")
      .set("x-internal-secret", process.env.INTERNAL_API_SECRET)
      .send({ customer_id: String(customer._id) });
    expect(res.status).toBe(200);
    await expect(inactive).resolves.toEqual({ code: "ACCOUNT_INACTIVE" });
    await disconnected;
    expect(socket.connected).toBe(false);
  });

  test("the internal endpoint requires the shared secret", async () => {
    const customer = await seedCustomer();
    const res = await request(techApp)
      .post("/api/customers/internal/disconnect")
      .send({ customer_id: String(customer._id) });
    expect(res.status).toBe(401);
  });
});
