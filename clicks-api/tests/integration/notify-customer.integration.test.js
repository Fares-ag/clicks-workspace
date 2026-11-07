/**
 * WS-C: one customer notifier (scenarios 46, 49, 52, 68, 71, 73, 74, 76).
 *
 *  - the inbox row is written BEFORE the push goes out;
 *  - one transition notifies exactly once across the REST and socket paths;
 *  - admin-API hold / resume / complete / cancel reach the customer through
 *    the outbox (CUSTOMER_NOTIFY → tech API → socket + push);
 *  - a failed cross-API delivery is retried by the outbox and never
 *    delivered twice.
 */
const request = require("supertest");
const axios = require("axios");
const {
  Job,
  Notification,
  OutboxEvent,
} = require("../../clicks-shared/models");
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
  seedAdmin,
  seedCustomer,
  seedCustomerJob,
  seedTechnician,
} = require("../helpers/seed");
const { adminToken, bearer, customerToken, technicianToken } = require("../helpers/tokens");
const { sendCustomerPush } = require("../../clicks-customer-tech-api/src/services/fcmService");
const notifier = require("../../clicks-shared/services/notifyCustomer");
const { OUTBOX_TYPES, runOutboxEventNow } = require("../../clicks-shared/services/outboxWorker");

const SUPER = "507f1f77bcf86cd799439051";

let techApp;
let adminApp;
let server;
let baseUrl;
let localTransport;
const openSockets = [];

beforeAll(async () => {
  await connectTestDb();
  await Notification.init();
  const { createTechAppWithSocket } = require("../../clicks-customer-tech-api/src/createApp");
  ({ app: techApp, server } = await createTechAppWithSocket());
  ({ baseUrl } = await listenServer(server));
  adminApp = require("../../clicks-admin-api/src/createApp").createAdminApp();
  localTransport = notifier.getCustomerNotifyTransport();
});

afterAll(async () => {
  disconnectAll(openSockets);
  await closeServer(server);
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearCollections();
  await seedAdmin({ _id: SUPER, role: "Super Admin" });
  sendCustomerPush.mockReset();
  sendCustomerPush.mockImplementation(async () => true);
  axios.post.mockReset();
  axios.post.mockImplementation(async () => ({ status: 200, data: {} }));
  notifier.setCustomerNotifyTransport(localTransport);
});

async function customerSocket(customer) {
  const socket = await connectSocket({
    baseUrl,
    namespace: "/customer",
    token: customerToken(customer._id),
  });
  openSockets.push(socket);
  socket.emit("register");
  await new Promise((r) => setTimeout(r, 150));
  return socket;
}

async function technicianSocket(technician) {
  const socket = await connectSocket({
    baseUrl,
    namespace: "/technician",
    token: technicianToken(technician._id),
  });
  openSockets.push(socket);
  socket.emit("register");
  await new Promise((r) => setTimeout(r, 150));
  return socket;
}

function countEvents(socket, event) {
  const seen = [];
  socket.on(event, (p) => seen.push(p));
  return seen;
}

/**
 * The admin API process has no socket server. Hide the tech API's transport
 * while the admin request runs and forward the outbox's axios call to the
 * tech API app (which has the transport) — the real cross-API path.
 */
function runAsSeparateProcesses({ failFirst = 0 } = {}) {
  notifier.setCustomerNotifyTransport(null);
  let failures = failFirst;
  axios.post.mockImplementation(async (url, body, opts = {}) => {
    if (failures > 0) {
      failures -= 1;
      const err = new Error("timeout of 5000ms exceeded");
      err.code = "ECONNABORTED";
      throw err;
    }
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    notifier.setCustomerNotifyTransport(localTransport);
    try {
      const res = await request(techApp)
        .post(path)
        .set(opts.headers || {})
        .send(body);
      return { status: res.status, data: res.body };
    } finally {
      notifier.setCustomerNotifyTransport(null);
    }
  });
}

describe("inbox before push", () => {
  test("REST en_route: inbox row exists when the push is sent, socket carries its id", async () => {
    const customer = await seedCustomer({ fcm_token: "x".repeat(100) });
    const technician = await seedTechnician();
    const job = await seedCustomerJob({ customer, technician, jobStatus: "accepted" });
    const socket = await customerSocket(customer);

    const rowsAtPush = [];
    sendCustomerPush.mockImplementation(async (_cid, push) => {
      rowsAtPush.push(
        await Notification.countDocuments({ customer_id: customer._id, event: push.event })
      );
      return true;
    });

    const enRoute = waitForEvent(socket, "technicianEnRoute");
    const res = await request(techApp)
      .patch(`/api/jobs/${job._id}/status`)
      .set(bearer(technicianToken(technician._id)))
      .send({ job_status: "en_route" });
    expect(res.status).toBe(200);

    const payload = await enRoute;
    expect(payload.job_id).toBe(String(job._id));
    expect(payload.notification_id).toBeTruthy();

    expect(sendCustomerPush).toHaveBeenCalledTimes(1);
    expect(rowsAtPush).toEqual([1]);
    const [, push] = sendCustomerPush.mock.calls[0];
    expect(push).toMatchObject({
      event: "technicianEnRoute",
      job_id: String(job._id),
      notification_id: payload.notification_id,
      title: "On the way",
    });

    const row = await Notification.findById(payload.notification_id).lean();
    expect(row.type).toBe("en_route");
    expect(row.data.job_id).toBe(String(job._id));
    expect(row.delivered_at).toBeTruthy();
  });
});

describe("exactly one notification per transition", () => {
  test("REST en_route then a late socket startEnRoute: one row, one push, one socket event", async () => {
    const customer = await seedCustomer();
    const technician = await seedTechnician();
    const job = await seedCustomerJob({ customer, technician, jobStatus: "accepted" });
    const socket = await customerSocket(customer);
    const techSocket = await technicianSocket(technician);
    const seen = countEvents(socket, "technicianEnRoute");

    await request(techApp)
      .patch(`/api/jobs/${job._id}/status`)
      .set(bearer(technicianToken(technician._id)))
      .send({ job_status: "en_route" })
      .expect(200);

    const refused = waitForEvent(techSocket, "error");
    techSocket.emit("startEnRoute", { job_id: String(job._id) });
    expect((await refused).message).toMatch(/en route|status/i);
    await new Promise((r) => setTimeout(r, 300));

    expect(seen).toHaveLength(1);
    expect(
      await Notification.countDocuments({ customer_id: customer._id, event: "technicianEnRoute" })
    ).toBe(1);
    expect(
      sendCustomerPush.mock.calls.filter(([, p]) => p.event === "technicianEnRoute")
    ).toHaveLength(1);
  });

  test("socket path (markArrived) notifies through the same notifier: inbox + push", async () => {
    const customer = await seedCustomer();
    const technician = await seedTechnician();
    const job = await seedCustomerJob({ customer, technician, jobStatus: "en_route" });
    const socket = await customerSocket(customer);
    const techSocket = await technicianSocket(technician);

    const arrived = waitForEvent(socket, "technicianArrived");
    techSocket.emit("markArrived", { job_id: String(job._id) });
    const payload = await arrived;
    expect(payload.notification_id).toBeTruthy();
    expect(
      await Notification.countDocuments({ customer_id: customer._id, type: "arrived" })
    ).toBe(1);
    expect(sendCustomerPush.mock.calls.map(([, p]) => p.event)).toEqual(["technicianArrived"]);
  });

  test("the same transition reported twice (same timestamp) is deduped", async () => {
    const customer = await seedCustomer();
    const at = new Date();
    const first = await notifier.notifyCustomer(customer._id, "technicianArrived", {
      job_id: "507f1f77bcf86cd799439099",
      arrived_at: at,
    });
    const second = await notifier.notifyCustomer(customer._id, "technicianArrived", {
      job_id: "507f1f77bcf86cd799439099",
      arrived_at: at,
    });
    expect(first.delivered).toBe(true);
    expect(second.duplicate).toBe(true);
    expect(await Notification.countDocuments({ customer_id: customer._id })).toBe(1);
    expect(sendCustomerPush).toHaveBeenCalledTimes(1);
  });

  test("socket paymentReceived after REST confirmPayment does not notify again (scenario 71)", async () => {
    const customer = await seedCustomer();
    const technician = await seedTechnician();
    const job = await seedCustomerJob({ customer, technician, jobStatus: "in_progress", price: 120 });
    const socket = await customerSocket(customer);
    const techSocket = await technicianSocket(technician);
    const seen = countEvents(socket, "paymentConfirmed");

    const paid = await request(techApp)
      .post(`/api/jobs/${job._id}/payment`)
      .set(bearer(technicianToken(technician._id)))
      .send({ payment_method: "cash" });
    expect(paid.status).toBe(200);

    const confirmed = waitForEvent(techSocket, "paymentConfirmed");
    techSocket.emit("paymentReceived", { job_id: String(job._id), payment_method: "cash" });
    await confirmed;
    await new Promise((r) => setTimeout(r, 300));

    expect(seen).toHaveLength(1);
    const pushes = sendCustomerPush.mock.calls.filter(([, p]) => p.event === "paymentConfirmed");
    expect(pushes).toHaveLength(1);
    expect(pushes[0][1].body).toMatch(/QAR 120\.00/);
    expect(
      await Notification.countDocuments({ customer_id: customer._id, type: "payment_received" })
    ).toBe(1);
  });

  test("socket paymentReceived never marks an unpaid job paid (REST is the only payment path)", async () => {
    const customer = await seedCustomer();
    const technician = await seedTechnician();
    const job = await seedCustomerJob({ customer, technician, jobStatus: "in_progress", price: 75 });
    const techSocket = await technicianSocket(technician);

    const refused = waitForEvent(techSocket, "error");
    techSocket.emit("paymentReceived", { job_id: String(job._id), payment_method: "card" });
    const err = await refused;
    expect(err.code).toBe("USE_REST_CONFIRM_PAYMENT");

    const fresh = await Job.findById(job._id).lean();
    expect(fresh.payment_status).toBe("unpaid");
    expect(fresh.payment_method || null).not.toBe("card");
    expect(sendCustomerPush.mock.calls.filter(([, p]) => p.event === "paymentConfirmed")).toHaveLength(0);
  });

  test("socket adminCancelJob: a dispatcher cannot take a refund decision on a paid job", async () => {
    const DISPATCHER = "507f1f77bcf86cd799439052";
    await seedAdmin({ _id: DISPATCHER, role: "Job Dispatcher" });
    const customer = await seedCustomer();
    const job = await seedCustomerJob({ customer, jobStatus: "in_progress", price: 200 });
    await Job.updateOne({ _id: job._id }, { $set: { payment_status: "paid", payment_method: "card" } });

    const dispatcherSocket = await connectSocket({
      baseUrl,
      namespace: "/admin",
      token: adminToken("Job Dispatcher", DISPATCHER),
    });
    openSockets.push(dispatcherSocket);
    const ack = await new Promise((resolve) =>
      dispatcherSocket.emit(
        "adminCancelJob",
        { job_id: String(job._id), reason: "No show", refund: "full" },
        resolve
      )
    );
    expect(ack.ok).toBe(false);
    expect(ack.code).toBe("REFUND_DECISION_FORBIDDEN");
    expect((await Job.findById(job._id).lean()).job_status).toBe("in_progress");
  });

  test("technician reject: the customer hears jobReassigning (push + inbox, scenario 46)", async () => {
    const customer = await seedCustomer();
    const technician = await seedTechnician();
    const job = await seedCustomerJob({ customer, technician, jobStatus: "assigned" });
    const socket = await customerSocket(customer);
    const reassigning = waitForEvent(socket, "jobReassigning");

    await request(techApp)
      .post(`/api/technicians/jobs/${job._id}/reject`)
      .set(bearer(technicianToken(technician._id)))
      .send({ rejection_description: "flat battery on my van" })
      .expect(200);

    const payload = await reassigning;
    expect(payload.job_id).toBe(String(job._id));
    expect(payload.reason).toBeUndefined();
    const row = await Notification.findOne({ customer_id: customer._id, type: "job_reassigning" });
    expect(row.title).toBe("Finding another technician");
    expect(sendCustomerPush.mock.calls.map(([, p]) => p.event)).toContain("jobReassigning");
  });
});

describe("admin API transitions reach the customer through the outbox (scenario 68)", () => {
  test("hold then resume: jobOnHold (with reason) and jobResumed, inbox + push", async () => {
    const customer = await seedCustomer();
    const technician = await seedTechnician({ currentStatus: "On Job" });
    const job = await seedCustomerJob({ customer, technician, jobStatus: "en_route" });
    const socket = await customerSocket(customer);
    runAsSeparateProcesses();

    const onHold = waitForEvent(socket, "jobOnHold");
    await request(adminApp)
      .post(`/api/jobs/${job._id}/hold`)
      .set(bearer(adminToken("Super Admin", SUPER)))
      .send({ reason: "Waiting for a replacement tyre" })
      .expect(200);
    const held = await onHold;
    expect(held.job_id).toBe(String(job._id));
    expect(held.hold_reason).toBe("Waiting for a replacement tyre");

    const resumed = waitForEvent(socket, "jobResumed");
    await request(adminApp)
      .post(`/api/jobs/${job._id}/resume`)
      .set(bearer(adminToken("Super Admin", SUPER)))
      .send({})
      .expect(200);
    expect((await resumed).job_status).toBe("en_route");

    const types = (await Notification.find({ customer_id: customer._id }).lean()).map((n) => n.type);
    expect(types.sort()).toEqual(["job_on_hold", "job_resumed"]);
    const outbox = await OutboxEvent.find({ type: OUTBOX_TYPES.CUSTOMER_NOTIFY }).lean();
    expect(outbox).toHaveLength(2);
    expect(outbox.every((e) => e.status === "sent")).toBe(true);
    expect(sendCustomerPush.mock.calls.map(([, p]) => p.event)).toEqual(["jobOnHold", "jobResumed"]);
    // 5 s timeout on the cross-API call.
    expect(axios.post.mock.calls[0][2].timeout).toBe(5000);
  });

  test("admin complete: jobCompleted reaches the customer (scenario 76)", async () => {
    const customer = await seedCustomer();
    const technician = await seedTechnician({ currentStatus: "On Job" });
    const job = await seedCustomerJob({ customer, technician, jobStatus: "in_progress", price: 90 });
    const socket = await customerSocket(customer);
    runAsSeparateProcesses();

    const completed = waitForEvent(socket, "jobCompleted");
    await request(adminApp)
      .post(`/api/jobs/${job._id}/complete`)
      .set(bearer(adminToken("Super Admin", SUPER)))
      .send({ completion_notes: "Closed by dispatch" })
      .expect(200);
    const payload = await completed;
    expect(payload.job_id).toBe(String(job._id));
    expect(payload.completed_by).toBe("admin");
    expect(
      await Notification.countDocuments({ customer_id: customer._id, type: "job_completed" })
    ).toBe(1);
  });

  test("admin cancel: exactly one jobCancelled for the customer; the technician is told too", async () => {
    const customer = await seedCustomer();
    const technician = await seedTechnician({ currentStatus: "On Job" });
    const job = await seedCustomerJob({ customer, technician, jobStatus: "en_route" });
    const socket = await customerSocket(customer);
    const techSocket = await technicianSocket(technician);
    const seen = countEvents(socket, "jobCancelled");
    runAsSeparateProcesses();

    const techCancelled = waitForEvent(techSocket, "jobCancelled");
    await request(adminApp)
      .post(`/api/jobs/${job._id}/cancel`)
      .set(bearer(adminToken("Super Admin", SUPER)))
      .send({ reason: "Customer called to cancel" })
      .expect(200);
    await techCancelled;
    await new Promise((r) => setTimeout(r, 300));

    expect(seen).toHaveLength(1);
    expect(seen[0].cancelled_by).toBe("admin");
    expect(
      await Notification.countDocuments({ customer_id: customer._id, type: "job_cancelled" })
    ).toBe(1);
    const types = (await OutboxEvent.find({}).lean()).map((e) => e.type).sort();
    expect(types).toEqual([OUTBOX_TYPES.CUSTOMER_NOTIFY, OUTBOX_TYPES.TECH_API_NOTIFY].sort());
  });

  test("garage send and garage ready push to the customer (scenario 52)", async () => {
    const customer = await seedCustomer();
    const technician = await seedTechnician({ currentStatus: "On Job" });
    const job = await seedCustomerJob({ customer, technician, jobStatus: "in_progress" });
    const socket = await customerSocket(customer);
    runAsSeparateProcesses();

    const atGarage = waitForEvent(socket, "jobAtGarage");
    await request(adminApp)
      .post(`/api/jobs/${job._id}/garage`)
      .set(bearer(adminToken("Super Admin", SUPER)))
      .send({ reason: "Gearbox", garage_name: "Al Sadd Motors" })
      .expect(200);
    expect((await atGarage).garage.name).toBe("Al Sadd Motors");

    const ready = waitForEvent(socket, "jobGarageReady");
    await request(adminApp)
      .post(`/api/jobs/${job._id}/garage/ready`)
      .set(bearer(adminToken("Super Admin", SUPER)))
      .send({})
      .expect(200);
    await ready;
    expect(sendCustomerPush.mock.calls.map(([, p]) => p.event)).toEqual([
      "jobAtGarage",
      "jobGarageReady",
    ]);
  });
});

describe("outbox retry", () => {
  test("a timed-out delivery stays pending, is retried, and is delivered once", async () => {
    const customer = await seedCustomer();
    const technician = await seedTechnician({ currentStatus: "On Job" });
    const job = await seedCustomerJob({ customer, technician, jobStatus: "en_route" });
    const socket = await customerSocket(customer);
    const seen = countEvents(socket, "jobOnHold");
    runAsSeparateProcesses({ failFirst: 1 });

    await request(adminApp)
      .post(`/api/jobs/${job._id}/hold`)
      .set(bearer(adminToken("Super Admin", SUPER)))
      .send({ reason: "Parts awaited" })
      .expect(200);

    // Inbox row exists already; delivery failed and is queued for retry.
    const row = await Notification.findOne({ customer_id: customer._id, type: "job_on_hold" }).lean();
    expect(row).toBeTruthy();
    expect(row.delivered_at).toBeNull();
    const pending = await OutboxEvent.findOne({ type: OUTBOX_TYPES.CUSTOMER_NOTIFY }).lean();
    expect(pending.status).toBe("pending");
    expect(pending.attempts).toBe(1);
    expect(pending.last_error).toMatch(/timeout/);
    expect(seen).toHaveLength(0);

    // The worker's retry delivers it.
    await OutboxEvent.updateOne({ _id: pending._id }, { $set: { next_attempt_at: new Date() } });
    expect(await runOutboxEventNow(pending._id)).toBe(true);
    await new Promise((r) => setTimeout(r, 200));
    expect(seen).toHaveLength(1);
    expect((await OutboxEvent.findById(pending._id)).status).toBe("sent");
    expect((await Notification.findById(row._id)).delivered_at).toBeTruthy();

    // A replay of the same delivery (first attempt timed out AFTER the tech
    // API delivered it) is a no-op.
    notifier.setCustomerNotifyTransport(localTransport);
    const replay = await request(techApp)
      .post("/api/notifications/internal/deliver")
      .set("x-internal-secret", process.env.INTERNAL_API_SECRET)
      .send(pending.payload);
    expect(replay.status).toBe(200);
    expect(replay.body.alreadyDelivered).toBe(true);
    await expectNoEvent(socket, "jobOnHold", 300);
    expect(seen).toHaveLength(1);
    expect(sendCustomerPush).toHaveBeenCalledTimes(1);
  });

  test("the internal deliver endpoint requires the internal secret", async () => {
    const res = await request(techApp)
      .post("/api/notifications/internal/deliver")
      .send({ customer_id: "507f1f77bcf86cd799439011", event: "jobOnHold" });
    expect(res.status).toBe(401);
  });
});

describe("support ticket acks go through the notifier", () => {
  test("Contact Us submit: inbox row + push with the ticket number", async () => {
    const customer = await seedCustomer();
    const res = await request(techApp)
      .post("/api/contact-us")
      .set(bearer(customerToken(customer._id)))
      .send({ category: "billing", description: "I was charged twice for one job." });
    expect(res.status).toBe(201);
    const row = await Notification.findOne({ customer_id: customer._id }).lean();
    expect(row.type).toBe("support_ticket_received");
    expect(row.data.ticket_number).toBe(res.body.ticket_number);
    const [, push] = sendCustomerPush.mock.calls[0];
    expect(push.event).toBe("supportTicketReceived");
    expect(push.body).toContain(res.body.ticket_number);
  });
});

test("job doc keeps its state while notifications flow (sanity)", async () => {
  const customer = await seedCustomer();
  const technician = await seedTechnician();
  const job = await seedCustomerJob({ customer, technician, jobStatus: "accepted" });
  await request(techApp)
    .patch(`/api/jobs/${job._id}/status`)
    .set(bearer(technicianToken(technician._id)))
    .send({ job_status: "en_route" })
    .expect(200);
  expect((await Job.findById(job._id)).job_status).toBe("en_route");
});
