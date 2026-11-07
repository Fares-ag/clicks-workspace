/**
 * Scenarios 38-40: the SOS escalation ladder and claim auto-release.
 * The sweep is driven directly with a synthetic `now` (no wall-clock waits).
 */
const request = require("supertest");
const {
  AdminAuditLog,
  OpsSetting,
  SOSRequest,
} = require("../../clicks-shared/models");
const { connectTestDb, disconnectTestDb, clearCollections, mongoose } = require("../helpers/db");
const { seedAdmin, seedCustomer, JOB_LAT, JOB_LNG } = require("../helpers/seed");
const { adminToken, bearer } = require("../helpers/tokens");
const {
  runEscalationSweep,
} = require("../../clicks-shared/services/sosEscalation");
const { clearOpsSettingsCache } = require("../../clicks-shared/services/opsSettings");

const MIN = 60 * 1000;
const ADMIN_ID = "507f1f77bcf86cd799439061";
let adminApp;

function fakeNotifier() {
  const calls = [];
  const rec = (name) => async (...args) => {
    calls.push({ name, args });
  };
  return {
    calls,
    of: (name) => calls.filter((c) => c.name === name),
    notifier: {
      adminAlert: rec("adminAlert"),
      adminPush: rec("adminPush"),
      recordAdminNotification: rec("recordAdminNotification"),
      customerEvent: rec("customerEvent"),
      sendSms: rec("sendSms"),
    },
  };
}

function later(ms) {
  return new Date(Date.now() + ms);
}

async function pendingSos(customer, extra = {}) {
  return SOSRequest.create({
    customer_id: customer._id,
    location: { type: "Point", coordinates: [JOB_LNG, JOB_LAT] },
    status: "pending",
    ...extra,
  });
}

beforeAll(async () => {
  await connectTestDb();
  adminApp = require("../../clicks-admin-api/src/createApp").createAdminApp();
});

afterAll(async () => {
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearCollections();
  await mongoose.connection.collection("ops_leases").deleteMany({});
  clearOpsSettingsCache();
  delete process.env.ONCALL_PHONE;
  delete process.env.SUPPORT_PHONE;
});

test("2 min: re-push dispatchers once; repeat sweeps do not double-send", async () => {
  const customer = await seedCustomer();
  const sos = await pendingSos(customer);
  const f = fakeNotifier();

  const early = await runEscalationSweep({ now: later(1 * MIN), notifier: f.notifier });
  expect(early.repushed).toEqual([]);

  const r1 = await runEscalationSweep({ now: later(2.5 * MIN), notifier: f.notifier });
  expect(r1.repushed).toEqual([String(sos._id)]);
  expect(f.of("adminPush")).toHaveLength(1);
  expect(f.of("adminAlert")[0].args[0]).toBe("sosEscalated");

  const r2 = await runEscalationSweep({ now: later(3 * MIN), notifier: f.notifier });
  expect(r2.repushed).toEqual([]);
  expect(f.of("adminPush")).toHaveLength(1);

  const stored = await SOSRequest.findById(sos._id).lean();
  expect(stored.escalation_level).toBe(1);
  expect(stored.last_escalated_at).toBeTruthy();
});

test("5 min: SMS every on-call number from ONCALL_PHONE", async () => {
  process.env.ONCALL_PHONE = "+97455500001, +97455500002";
  const customer = await seedCustomer();
  const sos = await pendingSos(customer);
  const f = fakeNotifier();

  const res = await runEscalationSweep({ now: later(5.5 * MIN), notifier: f.notifier });
  // Levels 1 and 2 both fire on the first sweep that sees a 5-minute SOS.
  expect(res.repushed).toEqual([String(sos._id)]);
  expect(res.oncall).toEqual([String(sos._id)]);
  const sms = f.of("sendSms").map((c) => c.args[0]).sort();
  expect(sms).toEqual(["+97455500001", "+97455500002"]);
  expect(f.of("sendSms")[0].args[1]).toMatch(/SOS/);

  await runEscalationSweep({ now: later(6 * MIN), notifier: f.notifier });
  expect(f.of("sendSms")).toHaveLength(2);
});

test("admin ops setting overrides ONCALL_PHONE; with neither set, all admins are pushed", async () => {
  process.env.ONCALL_PHONE = "+97455500001";
  await OpsSetting.create({ key: "oncall_phones", value: ["+97455500099"] });
  clearOpsSettingsCache();
  const customer = await seedCustomer();
  await pendingSos(customer);
  const f = fakeNotifier();
  await runEscalationSweep({ now: later(5.5 * MIN), notifier: f.notifier });
  expect(f.of("sendSms").map((c) => c.args[0])).toEqual(["+97455500099"]);

  // Nobody configured: no SMS, push + socket alert to every admin instead.
  await OpsSetting.deleteMany({});
  delete process.env.ONCALL_PHONE;
  clearOpsSettingsCache();
  const other = await seedCustomer({
    phone_number: "+97450011122",
    email: "escalation-second@test.local",
  });
  await pendingSos(other);
  const g = fakeNotifier();
  await runEscalationSweep({ now: later(5.5 * MIN), notifier: g.notifier });
  expect(g.of("sendSms")).toHaveLength(0);
  expect(g.of("adminPush").length).toBeGreaterThanOrEqual(2);
  const level2 = g
    .of("adminAlert")
    .find((c) => c.args[0] === "sosEscalated" && c.args[1].escalation_level === 2);
  expect(level2.args[1].audience).toBe("all_admins");
});

test("8 min: the customer is told 'still connecting' with the support number", async () => {
  process.env.SUPPORT_PHONE = "+97444001234";
  const customer = await seedCustomer();
  const sos = await pendingSos(customer);
  const f = fakeNotifier();

  const res = await runEscalationSweep({ now: later(8.5 * MIN), notifier: f.notifier });
  expect(res.customer).toEqual([String(sos._id)]);
  const [evt] = f.of("customerEvent");
  expect(evt.args[0]).toBe(String(customer._id));
  expect(evt.args[1]).toBe("sosStillConnecting");
  expect(evt.args[2].support_phone).toBe("+97444001234");
  expect(evt.args[2].sos_id).toBe(String(sos._id));

  await runEscalationSweep({ now: later(9 * MIN), notifier: f.notifier });
  expect(f.of("customerEvent")).toHaveLength(1);
  expect((await SOSRequest.findById(sos._id)).escalation_level).toBe(3);
});

test("lease: a concurrent sweep from a second instance is skipped and nothing double-sends", async () => {
  const customer = await seedCustomer();
  await pendingSos(customer);
  const f = fakeNotifier();
  const now = later(2.5 * MIN);

  const [a, b] = await Promise.all([
    runEscalationSweep({ now, notifier: f.notifier, owner: "instance-a" }),
    runEscalationSweep({ now, notifier: f.notifier, owner: "instance-b" }),
  ]);
  const skipped = [a, b].filter((r) => r.skipped);
  expect(skipped).toHaveLength(1);
  expect(f.of("adminPush")).toHaveLength(1);

  // While the lease is live, the other instance stays out.
  const holder = a.skipped ? "instance-b" : "instance-a";
  const other = a.skipped ? "instance-a" : "instance-b";
  expect((await runEscalationSweep({ now, notifier: f.notifier, owner: other })).skipped).toBe(true);
  expect((await runEscalationSweep({ now, notifier: f.notifier, owner: holder })).skipped).toBe(false);
  // After it expires the other instance takes over.
  const takeover = await runEscalationSweep({
    now: later(10 * MIN),
    notifier: f.notifier,
    owner: other,
  });
  expect(takeover.skipped).toBe(false);
});

test("claim with no job after 5 min is released to pending, re-alerted and audited", async () => {
  await seedAdmin({ _id: ADMIN_ID, role: "Job Dispatcher" });
  const customer = await seedCustomer();
  const sos = await pendingSos(customer, {
    status: "in_call",
    claimed_by: ADMIN_ID,
    claimed_at: new Date(),
    in_call_at: new Date(),
  });
  const f = fakeNotifier();

  const early = await runEscalationSweep({ now: later(4 * MIN), notifier: f.notifier });
  expect(early.released).toEqual([]);

  const res = await runEscalationSweep({ now: later(5.5 * MIN), notifier: f.notifier });
  expect(res.released).toEqual([String(sos._id)]);
  const stored = await SOSRequest.findById(sos._id).lean();
  expect(stored.status).toBe("pending");
  expect(stored.claimed_by).toBeUndefined();
  expect(stored.claimed_at).toBeUndefined();
  expect(stored.claim_release_count).toBe(1);
  expect(f.of("adminAlert").some((c) => c.args[0] === "sosClaimReleased")).toBe(true);

  const audit = await AdminAuditLog.findOne({
    action: "sos.claim_auto_release",
    entity_id: sos._id,
  }).lean();
  expect(audit).toBeTruthy();
  expect(String(audit.admin_id)).toBe(ADMIN_ID);
  expect(audit.admin_role).toBe("system");

  // Released SOS can be claimed again over REST.
  const claim = await request(adminApp)
    .post(`/api/sos/${sos._id}/claim`)
    .set(bearer(adminToken("Job Dispatcher", ADMIN_ID)));
  expect(claim.status).toBe(200);
  const reclaimed = await SOSRequest.findById(sos._id).lean();
  expect(reclaimed.status).toBe("in_call");
  expect(reclaimed.claimed_at).toBeTruthy();
});

test("supervisor take-over moves the claim and is audited; dispatchers cannot", async () => {
  const OTHER = "507f1f77bcf86cd799439062";
  await seedAdmin({ _id: ADMIN_ID, role: "Job Dispatcher" });
  await seedAdmin({ _id: OTHER, role: "Super Admin" });
  const customer = await seedCustomer();
  const sos = await pendingSos(customer, {
    status: "in_call",
    claimed_by: ADMIN_ID,
    claimed_at: new Date(),
  });

  const denied = await request(adminApp)
    .post(`/api/sos/${sos._id}/takeover`)
    .set(bearer(adminToken("Job Dispatcher", ADMIN_ID)));
  expect(denied.status).toBe(403);

  const res = await request(adminApp)
    .post(`/api/sos/${sos._id}/takeover`)
    .set(bearer(adminToken("Super Admin", OTHER)));
  expect(res.status).toBe(200);
  expect(res.body.previous_claimed_by).toBe(ADMIN_ID);
  expect(String((await SOSRequest.findById(sos._id)).claimed_by)).toBe(OTHER);
  expect(await AdminAuditLog.countDocuments({ action: "sos.takeover" })).toBe(1);
});

test("admin SOS list carries age, escalation level and outstanding balance", async () => {
  await seedAdmin({ _id: ADMIN_ID, role: "Job Dispatcher" });
  const customer = await seedCustomer();
  await pendingSos(customer, { escalation_level: 2, outstanding_balance: 75 });

  const res = await request(adminApp)
    .get("/api/sos")
    .set(bearer(adminToken("Job Dispatcher", ADMIN_ID)));
  expect(res.status).toBe(200);
  const [row] = res.body.requests;
  expect(row.escalation_level).toBe(2);
  expect(row.outstanding_balance).toBe(75);
  expect(typeof row.age_seconds).toBe("number");
});

describe("ops settings API", () => {
  test("full admin can read and set on-call + support numbers; changes are audited", async () => {
    await seedAdmin({ _id: ADMIN_ID, role: "Super Admin" });
    process.env.SUPPORT_PHONE = "+97444000000";
    const token = adminToken("Super Admin", ADMIN_ID);

    const before = await request(adminApp).get("/api/ops-settings").set(bearer(token));
    expect(before.status).toBe(200);
    expect(before.body.settings.support_phone).toMatchObject({
      value: "+97444000000",
      source: "env",
    });
    expect(before.body.settings.oncall_phones.source).toBe("none");

    const bad = await request(adminApp)
      .put("/api/ops-settings")
      .set(bearer(token))
      .send({ oncall_phones: ["55512345"] });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe("INVALID_PHONE");

    const put = await request(adminApp)
      .put("/api/ops-settings")
      .set(bearer(token))
      .send({ oncall_phones: "+97455500011,+97455500012", support_phone: "+97444001111" });
    expect(put.status).toBe(200);
    expect(put.body.settings.oncall_phones).toMatchObject({
      value: ["+97455500011", "+97455500012"],
      source: "admin",
    });
    expect(put.body.settings.support_phone.value).toBe("+97444001111");
    expect(await AdminAuditLog.countDocuments({ action: "ops_settings.update" })).toBe(2);

    // Clearing falls back to env.
    const cleared = await request(adminApp)
      .put("/api/ops-settings")
      .set(bearer(token))
      .send({ support_phone: "" });
    expect(cleared.body.settings.support_phone).toMatchObject({
      value: "+97444000000",
      source: "env",
    });
  });

  test("dispatchers cannot read or change ops settings", async () => {
    await seedAdmin({ _id: ADMIN_ID, role: "Job Dispatcher" });
    const token = adminToken("Job Dispatcher", ADMIN_ID);
    expect((await request(adminApp).get("/api/ops-settings").set(bearer(token))).status).toBe(403);
    expect(
      (await request(adminApp).put("/api/ops-settings").set(bearer(token)).send({ support_phone: "" })).status
    ).toBe(403);
  });
});
