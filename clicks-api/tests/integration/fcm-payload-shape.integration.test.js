/**
 * Scenario 69 / 73: the customer push must carry a `notification` block and
 * an `apns` alert block (iOS shows nothing for data-only pushes while the app
 * is backgrounded or closed), plus a per-job Android tag / iOS thread so one
 * job's notifications replace each other in the tray.
 *
 * fcmService is globally mocked in tests; the pure message builder is taken
 * from the real module.
 */
const fcm = jest.requireActual("../../clicks-customer-tech-api/src/services/fcmService");
const { CUSTOMER_EVENT_NAMES } = require("../../clicks-shared/constants/customerEvents");

const TOKEN = "t".repeat(120);
const JOB_A = "507f1f77bcf86cd799439a01";
const JOB_B = "507f1f77bcf86cd799439b02";

function build(event, data = {}, extra = {}) {
  const copy = fcm.customerPushCopyForEvent(event, data);
  return fcm.buildCustomerPushMessage(TOKEN, {
    event,
    type: event,
    title: copy.title,
    body: copy.body,
    job_id: data.job_id || "",
    sos_id: data.sos_id || "",
    notification_id: "n1",
    data,
    ...extra,
  });
}

test("customer push has notification + apns alert + android notification + data", () => {
  const msg = build("technicianArrived", { job_id: JOB_A, status: "arrived" });

  expect(msg.token).toBe(TOKEN);
  expect(msg.notification).toEqual({
    title: "Technician arrived",
    body: "Your technician has arrived at your location.",
  });

  expect(msg.apns.headers["apns-priority"]).toBe("10");
  expect(msg.apns.headers["apns-push-type"]).toBe("alert");
  const aps = msg.apns.payload.aps;
  expect(aps.alert).toEqual({ title: msg.notification.title, body: msg.notification.body });
  expect(aps.sound).toBe("default");
  expect(aps["content-available"]).toBe(1);
  expect(aps["thread-id"]).toBe(`job_${JOB_A}`);

  expect(msg.android.priority).toBe("high");
  expect(msg.android.notification.channelId).toBe("clicks_customer_channel");
  expect(msg.android.notification.tag).toBe(`job_${JOB_A}`);

  expect(msg.data).toMatchObject({
    event: "technicianArrived",
    type: "technicianArrived",
    job_id: JOB_A,
    notification_id: "n1",
    channelId: "clicks_customer_channel",
    status: "arrived",
  });
  for (const value of Object.values(msg.data)) {
    expect(typeof value).toBe("string");
  }
});

test("every notification of one job shares a tag / thread; different jobs do not", () => {
  const a1 = build("technicianEnRoute", { job_id: JOB_A });
  const a2 = build("jobCompleted", { job_id: JOB_A });
  const b1 = build("technicianEnRoute", { job_id: JOB_B });
  expect(a1.android.notification.tag).toBe(a2.android.notification.tag);
  expect(a1.apns.payload.aps["thread-id"]).toBe(a2.apns.payload.aps["thread-id"]);
  expect(a1.apns.headers["apns-collapse-id"]).toBe(a2.apns.headers["apns-collapse-id"]);
  expect(a1.android.notification.tag).not.toBe(b1.android.notification.tag);
});

test("SOS-only events group by SOS id", () => {
  const msg = build("sosInCall", { sos_id: "507f1f77bcf86cd799439c03" });
  expect(msg.android.notification.tag).toBe("sos_507f1f77bcf86cd799439c03");
  expect(msg.apns.payload.aps["thread-id"]).toBe("sos_507f1f77bcf86cd799439c03");
});

test("object payload fields are dropped from FCM data (string-only, under 4 KB)", () => {
  const msg = build("paymentConfirmed", {
    job_id: JOB_A,
    amount: 150,
    receipt: { lines: new Array(200).fill("x") },
  });
  expect(msg.data.receipt).toBeUndefined();
  expect(msg.data.amount).toBe("150");
  expect(msg.notification.body).toMatch(/QAR 150\.00/);
  expect(Buffer.byteLength(JSON.stringify(msg))).toBeLessThan(4096);
});

test("every catalogued customer event is pushable and has copy", () => {
  for (const event of CUSTOMER_EVENT_NAMES) {
    expect(fcm.CUSTOMER_PUSH_EVENTS.has(event)).toBe(true);
    const copy = fcm.customerPushCopyForEvent(event, {});
    expect(copy.title).toBeTruthy();
    expect(copy.body).toBeTruthy();
  }
  // High-frequency location updates never push.
  expect(fcm.CUSTOMER_PUSH_EVENTS.has("locationUpdate")).toBe(false);
});

test("sendCustomerPush sends the built message (firebase mocked)", async () => {
  jest.resetModules();
  const send = jest.fn(async () => "msg-id");
  jest.doMock("firebase-admin", () => ({
    apps: [],
    app: () => {
      throw new Error("no app");
    },
    initializeApp: () => ({ messaging: () => ({ send }) }),
    credential: { cert: () => ({}) },
  }), { virtual: true });
  process.env.FIREBASE_CUSTOMER_SERVICE_ACCOUNT_JSON = JSON.stringify({ project_id: "t" });
  try {
    const real = jest.requireActual("../../clicks-customer-tech-api/src/services/fcmService");
    const ok = await real.sendCustomerPush(TOKEN, {
      event: "jobOnHold",
      title: "Your job is paused",
      body: "Our team paused your job: parts",
      job_id: JOB_A,
      data: { job_id: JOB_A, hold_reason: "parts" },
    });
    expect(ok).toBe(true);
    const sent = send.mock.calls[0][0];
    expect(sent.notification.title).toBe("Your job is paused");
    expect(sent.apns.payload.aps.alert.body).toBe("Our team paused your job: parts");
    expect(sent.android.notification.tag).toBe(`job_${JOB_A}`);
    expect(sent.data.hold_reason).toBe("parts");
  } finally {
    delete process.env.FIREBASE_CUSTOMER_SERVICE_ACCOUNT_JSON;
    jest.dontMock("firebase-admin");
  }
});
