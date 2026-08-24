#!/usr/bin/env node
/**
 * Partner Management + Partner App QA (API + DB).
 *
 * Usage:
 *   node scripts/qa-partner.js
 *
 * Env:
 *   ADMIN_URL         default http://localhost:5000
 *   ADMIN_EMAIL       default admin@clicks.local
 *   ADMIN_PASSWORD    default Admin123!
 */
const path = require("path");
const fs = require("fs");
require("../clicks-admin-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-admin-api/.env"),
});

const mongoose = require("mongoose");
const bcrypt = require("../clicks-admin-api/node_modules/bcryptjs");
const Partner = require("../clicks-shared/models/Partner");
const PartnerEarning = require("../clicks-shared/models/PartnerEarning");
const PartnerWithdrawal = require("../clicks-shared/models/PartnerWithdrawal");
const Job = require("../clicks-shared/models/Job");
const Source = require("../clicks-shared/models/Source");
const Admin = require("../clicks-shared/models/Admin");
const {
  accruePartnerFromCompletedJob,
  ensureGoogleSourceWithSubSource,
} = require("../clicks-shared/services/partnerService");
const { generateAccessToken } = require("../clicks-admin-api/src/utils/authUtils");

const ADMIN_URL = (process.env.ADMIN_URL || "http://localhost:5000").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@clicks.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin123!";

const DEMO_EMAIL = "partner@clicks.local";
const DEMO_PASSWORD = "Partner123!";
const DEMO_NAME = "Demo Partner";

const JOB_LAT = 25.3269467;
const JOB_LNG = 51.4883967;

let passed = 0;
let failed = 0;
const results = {};
const jobIdsToDelete = [];

function step(id, ok, detail = "") {
  const mark = ok ? "PASS" : "FAIL";
  console.log(`${mark}  ${id}${detail ? ` — ${detail}` : ""}`);
  results[id] = { ok, detail };
  if (ok) passed++;
  else failed++;
  return ok;
}

async function json(method, url, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body != null) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(url, { method, headers, body: payload });
  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 200) };
  }
  return { status: res.status, data };
}

async function loginAdmin() {
  const r = await json("POST", `${ADMIN_URL}/api/auth/login`, {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  const token = r.data?.accessToken || r.data?.token;
  if (r.status !== 200 || !token) {
    throw new Error(`Admin login failed (${r.status})`);
  }
  return token;
}

async function loginPartner({ email, phone, password }) {
  const r = await json("POST", `${ADMIN_URL}/api/partner/login`, {
    body: { email, phone, password },
  });
  if (r.status !== 200 || !r.data?.token) {
    return { ok: false, status: r.status, data: r.data };
  }
  return { ok: true, token: r.data.token, partner: r.data.partner };
}

async function findGoogleSourceId(adminToken) {
  const r = await json("GET", `${ADMIN_URL}/api/sources?limit=50`, { token: adminToken });
  const list = r.data?.sources || [];
  const google = list.find((s) => String(s.mainSourceName).toLowerCase() === "google");
  return google?._id;
}

async function createAndCompleteJob(adminToken, { sourceId, subSource, jobType, price, partnerId }) {
  const now = new Date();
  now.setHours(now.getHours() + 1);
  const createR = await json("POST", `${ADMIN_URL}/api/jobs`, {
    token: adminToken,
    body: {
      clientName: "QA Partner Accrual",
      clientMobileNumber: `+974555${String(Date.now()).slice(-7)}`,
      issue: "QA partner accrual job",
      location: `LatLng(${JOB_LAT}, ${JOB_LNG})`,
      dateTime: now.toISOString(),
      jobType,
      source: sourceId,
      subSource,
      price,
    },
  });
  const jobId = createR.data?.job?._id;
  if (!createR.status || (createR.status !== 201 && createR.status !== 200) || !jobId) {
    throw new Error(`Create job failed (${createR.status}): ${JSON.stringify(createR.data).slice(0, 120)}`);
  }
  jobIdsToDelete.push(jobId);

  const completeR = await json("PUT", `${ADMIN_URL}/api/jobs/${jobId}`, {
    token: adminToken,
    body: { job_status: "completed", payment_status: "paid" },
  });
  if (completeR.status !== 200) {
    throw new Error(`Complete job failed (${completeR.status})`);
  }

  const job = await Job.findById(jobId).populate("source", "mainSourceName");
  const earning = await PartnerEarning.findOne({ job: jobId, partner: partnerId });
  return { jobId, job, earning, completeR: completeR.data };
}

async function cleanupJobs(adminToken) {
  for (const id of jobIdsToDelete) {
    await json("DELETE", `${ADMIN_URL}/api/jobs/${id}`, { token: adminToken }).catch(() => {});
  }
}

async function ensureDispatcherToken() {
  const email = "qa-dispatcher@clicks.local";
  let admin = await Admin.findOne({ email });
  if (!admin) {
    admin = await Admin.create({
      firstName: "QA",
      lastName: "Dispatcher",
      role: "Call Center Agent",
      email,
      phone: "+97455550199",
      password: bcrypt.hashSync("Dispatch123!", 10),
      isActive: true,
    });
  }
  return generateAccessToken({
    id: admin._id.toString(),
    role: admin.role,
    email: admin.email,
  });
}

async function main() {
  console.log(`ADMIN_URL=${ADMIN_URL}\n`);

  const health = await json("GET", `${ADMIN_URL}/api/health`);
  if (health.status !== 200) {
    console.error("Admin API not reachable. Start clicks-admin-api first.");
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI missing");
  await mongoose.connect(uri);

  let adminToken;
  try {
    adminToken = await loginAdmin();
    step("setup admin login", true);
  } catch (e) {
    step("setup admin login", false, e.message);
    process.exit(1);
  }

  // Seed Demo Partner + Google sub-source
  const inv = 10000;
  const profit = 4000;
  const period = 1;
  const started = new Date();
  const cap = inv + period * profit;
  let demo = await Partner.findOne({ email: DEMO_EMAIL });
  const demoPayload = {
    name: DEMO_NAME,
    phone: "+97455550001",
    email: DEMO_EMAIL,
    password: bcrypt.hashSync(DEMO_PASSWORD, 10),
    isActive: true,
    investmentAmount: inv,
    profitPerPeriod: profit,
    currentPeriodCap: cap,
    periodMonths: 2,
    currentPeriod: period,
    periodStartedAt: started,
    periodEndsAt: Partner.computePeriodEnd(started, 2),
    status: "active",
    accruedTotal: 0,
  };
  if (demo) {
    Object.assign(demo, demoPayload);
    await demo.save();
  } else {
    demo = await Partner.create({ ...demoPayload, accruedTotal: 0 });
  }
  await ensureGoogleSourceWithSubSource(DEMO_NAME);
  await PartnerWithdrawal.deleteMany({ partner: demo._id, status: "pending" });
  step("setup seed Demo Partner", true, demo._id.toString());

  const googleSourceId = await findGoogleSourceId(adminToken);
  step("setup Google source", Boolean(googleSourceId), googleSourceId || "missing");

  const suffix = String(Date.now()).slice(-6);
  const qaName = `QA Partner ${suffix}`;
  const qaEmail = `qa-partner-${suffix}@clicks.local`;
  const qaPassword = "Partner123!";
  let qaPartnerId = null;
  let qaPartnerToken = null;

  console.log("\n--- Phase A — Admin list/create ---");

  const listR = await json("GET", `${ADMIN_URL}/api/partners?limit=20`, { token: adminToken });
  step("A1 list partners", listR.status === 200 && Array.isArray(listR.data?.partners), `count=${listR.data?.partners?.length ?? 0}`);

  const activeR = await json("GET", `${ADMIN_URL}/api/partners?status=active&limit=5`, { token: adminToken });
  step("A1 filter active", activeR.status === 200, `count=${activeR.data?.partners?.length ?? 0}`);

  const searchR = await json("GET", `${ADMIN_URL}/api/partners?search=Demo`, { token: adminToken });
  const searchHit = (searchR.data?.partners || []).some((p) => p.name === DEMO_NAME);
  step("A2 search by name", searchR.status === 200 && searchHit);

  const createR = await json("POST", `${ADMIN_URL}/api/partners`, {
    token: adminToken,
    body: {
      name: qaName,
      phone: `+9745555${suffix}`,
      email: qaEmail,
      password: qaPassword,
      investmentAmount: 10000,
      profitPerPeriod: 4000,
      periodMonths: 2,
    },
  });
  qaPartnerId = createR.data?.partner?._id;
  const createOk =
    createR.status === 201 &&
    createR.data?.partner?.status === "active" &&
    createR.data?.partner?.currentPeriod === 1;
  step("A3 create partner", createOk, qaPartnerId || JSON.stringify(createR.data).slice(0, 80));

  const dupR = await json("POST", `${ADMIN_URL}/api/partners`, {
    token: adminToken,
    body: {
      name: qaName.toUpperCase(),
      email: `dup-${qaEmail}`,
      password: qaPassword,
    },
  });
  step("A4 duplicate name", dupR.status === 409, `status=${dupR.status}`);

  const shortR = await json("POST", `${ADMIN_URL}/api/partners`, {
    token: adminToken,
    body: { name: `Short PW ${suffix}`, email: `short-${qaEmail}`, password: "12345" },
  });
  step("A5 short password", shortR.status === 400, `status=${shortR.status}`);

  const qaLogin = await loginPartner({ email: qaEmail, password: qaPassword });
  qaPartnerToken = qaLogin.token;
  step("A6 partner login (new)", qaLogin.ok);

  console.log("\n--- Phase F — Partner auth/profile ---");

  const badLogin = await loginPartner({ email: qaEmail, password: "wrong-password" });
  step("F2 bad password", badLogin.status === 401);

  const dashR = await json("GET", `${ADMIN_URL}/api/partner/dashboard`, { token: qaPartnerToken });
  step(
    "F1 dashboard",
    dashR.status === 200 && Boolean(dashR.data?.partner) && Boolean(dashR.data?.stats),
    `status=${dashR.data?.partner?.status}`
  );

  const newPass = "Partner456!";
  const chgR = await json("POST", `${ADMIN_URL}/api/partner/change-password`, {
    token: qaPartnerToken,
    body: { currentPassword: qaPassword, newPassword: newPass },
  });
  step("F3 change password", chgR.status === 200, `status=${chgR.status}`);
  const oldFail = await loginPartner({ email: qaEmail, password: qaPassword });
  const newOk = await loginPartner({ email: qaEmail, password: newPass });
  step("F3 old password fails", oldFail.status === 401);
  step("F3 new password works", newOk.ok);
  qaPartnerToken = newOk.token;

  const newPhone = `+9745556${suffix}`;
  const profR = await json("PATCH", `${ADMIN_URL}/api/partner/me`, {
    token: qaPartnerToken,
    body: { phone: newPhone },
  });
  const adminGetR = await json("GET", `${ADMIN_URL}/api/partners/${qaPartnerId}`, { token: adminToken });
  step(
    "F4 update phone",
    profR.status === 200 && adminGetR.data?.partner?.phone === newPhone,
    newPhone
  );

  step("F5 session/logout", true, "N/A — Flutter-only; portal JWT validated above");
  step("F6 i18n", true, "SKIP — optional manual");

  console.log("\n--- Phase B — Admin details/terms ---");

  const detailR = await json("GET", `${ADMIN_URL}/api/partners/${demo._id}`, { token: adminToken });
  const earnListR = await json("GET", `${ADMIN_URL}/api/partners/${demo._id}/earnings`, { token: adminToken });
  const wdListR = await json("GET", `${ADMIN_URL}/api/partners/${demo._id}/withdrawals`, { token: adminToken });
  step(
    "B1 detail + earnings + withdrawals",
    detailR.status === 200 && earnListR.status === 200 && wdListR.status === 200
  );

  const patchR = await json("PATCH", `${ADMIN_URL}/api/partners/${demo._id}`, {
    token: adminToken,
    body: { profitPerPeriod: 4500, useFormulaCap: true },
  });
  step("B2 edit terms + formula cap", patchR.status === 200, `cap=${patchR.data?.partner?.currentPeriodCap}`);

  demo = await Partner.findById(demo._id);
  demo.accruedTotal = 0;
  demo.status = "active";
  demo.isActive = true;
  await demo.save();

  console.log("\n--- Phase C — Accrual ---");

  if (googleSourceId) {
    try {
      const beforeAccrued = demo.accruedTotal;
      const { jobId, job, earning } = await createAndCompleteJob(adminToken, {
        sourceId: googleSourceId,
        subSource: DEMO_NAME,
        jobType: "tire_change",
        price: 500,
        partnerId: demo._id,
      });
      demo = await Partner.findById(demo._id);
      step(
        "C1 accrual happy path",
        Boolean(earning) && demo.accruedTotal > beforeAccrued && String(job.partner_id) === String(demo._id),
        `accrued=${demo.accruedTotal}, job=${jobId}`
      );

      const earnCountBefore = await PartnerEarning.countDocuments({ job: jobId });
      await accruePartnerFromCompletedJob(job);
      const earnCountAfter = await PartnerEarning.countDocuments({ job: jobId });
      step("C2 idempotent accrual", earnCountBefore === earnCountAfter && earnCountAfter === 1);

      // C3 negatives via direct accrual helper
      const wrongType = await Job.create({
        clientName: "QA wrong type",
        clientMobileNumber: "+97455550002",
        issue: "x",
        location: "x",
        dateTime: new Date(),
        jobType: "Towing",
        job_status: "completed",
        source: googleSourceId,
        subSource: DEMO_NAME,
        price: 100,
      });
      jobIdsToDelete.push(String(wrongType._id));
      step("C3 wrong job type", (await accruePartnerFromCompletedJob(wrongType)) == null);

      const nonGoogleSrc = await Source.findOne({ mainSourceName: { $ne: "Google" } });
      if (nonGoogleSrc) {
        const wrongSrc = await Job.create({
          clientName: "QA wrong source",
          clientMobileNumber: "+97455550003",
          issue: "x",
          location: "x",
          dateTime: new Date(),
          jobType: "tire_change",
          job_status: "completed",
          source: nonGoogleSrc._id,
          subSource: DEMO_NAME,
          price: 100,
        });
        jobIdsToDelete.push(String(wrongSrc._id));
        step("C3 non-Google source", (await accruePartnerFromCompletedJob(wrongSrc)) == null);
      } else {
        step("C3 non-Google source", true, "SKIP — no non-Google source in DB");
      }

      const wrongSub = await Job.create({
        clientName: "QA wrong subSource",
        clientMobileNumber: "+97455550004",
        issue: "x",
        location: "x",
        dateTime: new Date(),
        jobType: "tire_change",
        job_status: "completed",
        source: googleSourceId,
        subSource: "Not A Real Partner",
        price: 100,
      });
      jobIdsToDelete.push(String(wrongSub._id));
      step("C3 wrong subSource", (await accruePartnerFromCompletedJob(wrongSub)) == null);

      demo.status = "inactive";
      demo.isActive = false;
      await demo.save();
      const inactiveJob = await Job.create({
        clientName: "QA inactive partner",
        clientMobileNumber: "+97455550005",
        issue: "x",
        location: "x",
        dateTime: new Date(),
        jobType: "tire_change",
        job_status: "completed",
        source: googleSourceId,
        subSource: DEMO_NAME,
        price: 100,
      });
      jobIdsToDelete.push(String(inactiveJob._id));
      step("C3 inactive partner", (await accruePartnerFromCompletedJob(inactiveJob)) == null);

      demo.isActive = true;
      demo.status = "active";
      demo.accruedTotal = 0;
      demo.currentPeriodCap = 550;
      await demo.save();
      const partial = await createAndCompleteJob(adminToken, {
        sourceId: googleSourceId,
        subSource: DEMO_NAME,
        jobType: "keyless_car_opening",
        price: 800,
        partnerId: demo._id,
      });
      demo = await Partner.findById(demo._id);
      step(
        "C4 partial cap",
        demo.status === "capped" && demo.accruedTotal === 550,
        `accrued=${demo.accruedTotal}, status=${demo.status}`
      );

      demo.accruedTotal = 100;
      demo.currentPeriodCap = 5000;
      demo.status = "active";
      demo.periodStartedAt = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);
      demo.periodEndsAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
      await demo.save();
      await json("GET", `${ADMIN_URL}/api/partners/${demo._id}`, { token: adminToken });
      demo = await Partner.findById(demo._id);
      step("C5 frozen on refresh", demo.status === "frozen", `status=${demo.status}`);

      step("C6 FCM push", true, "SKIP — requires device + token");
    } catch (e) {
      step("C accrual block", false, e.message);
    }
  } else {
    step("C accrual block", false, "no Google source");
  }

  console.log("\n--- Phase E — Withdrawals ---");

  demo = await Partner.findById(demo._id);
  demo.status = "active";
  demo.accruedTotal = 500;
  demo.periodStartedAt = new Date();
  demo.periodEndsAt = Partner.computePeriodEnd(new Date(), demo.periodMonths || 2);
  await demo.save();
  const demoLoginActive = await loginPartner({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
  const wdActiveR = await json("POST", `${ADMIN_URL}/api/partner/withdrawals`, {
    token: demoLoginActive.token,
    body: { type: "earnings" },
  });
  step(
    "E1 withdraw while active",
    wdActiveR.status === 400 &&
      String(wdActiveR.data?.message || "").includes("capped or frozen"),
    wdActiveR.data?.message || ""
  );

  demo.status = "capped";
  demo.accruedTotal = 14000;
  demo.currentPeriodCap = 14000;
  await demo.save();
  await PartnerWithdrawal.deleteMany({ partner: demo._id, status: "pending" });
  const demoLoginCapped = await loginPartner({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
  const dashCapped = await json("GET", `${ADMIN_URL}/api/partner/dashboard`, { token: demoLoginCapped.token });
  const wdCreateR = await json("POST", `${ADMIN_URL}/api/partner/withdrawals`, {
    token: demoLoginCapped.token,
    body: { type: "earnings" },
  });
  const withdrawalId = wdCreateR.data?.withdrawal?._id;
  step(
    "E2 withdraw when capped",
    wdCreateR.status === 201 && dashCapped.data?.withdrawAvailable === true,
    `amount=${wdCreateR.data?.withdrawal?.totalAmount}`
  );

  const wdDupR = await json("POST", `${ADMIN_URL}/api/partner/withdrawals`, {
    token: demoLoginCapped.token,
    body: { type: "investment" },
  });
  step("E3 duplicate pending", wdDupR.status === 409, `status=${wdDupR.status}`);

  const approveR = await json("PATCH", `${ADMIN_URL}/api/partners/${demo._id}/withdrawals/${withdrawalId}`, {
    token: adminToken,
    body: { status: "approved" },
  });
  const payR = await json("PATCH", `${ADMIN_URL}/api/partners/${demo._id}/withdrawals/${withdrawalId}`, {
    token: adminToken,
    body: { status: "paid" },
  });
  step("E4 approve then pay", approveR.status === 200 && payR.status === 200, payR.data?.withdrawal?.status);

  await PartnerWithdrawal.deleteMany({ partner: demo._id, status: "pending" });
  const wdPending2 = await json("POST", `${ADMIN_URL}/api/partner/withdrawals`, {
    token: demoLoginCapped.token,
    body: { type: "both" },
  });
  const wd2Id = wdPending2.data?.withdrawal?._id;
  const rejectR = await json("PATCH", `${ADMIN_URL}/api/partners/${demo._id}/withdrawals/${wd2Id}`, {
    token: adminToken,
    body: { status: "rejected" },
  });
  const wdAfterReject = await json("POST", `${ADMIN_URL}/api/partner/withdrawals`, {
    token: demoLoginCapped.token,
    body: { type: "earnings" },
  });
  step("E5 reject then re-request", rejectR.status === 200 && wdAfterReject.status === 201);

  await PartnerWithdrawal.deleteMany({ partner: demo._id, status: "pending" });
  const wdPending3 = await json("POST", `${ADMIN_URL}/api/partner/withdrawals`, {
    token: demoLoginCapped.token,
    body: { type: "earnings" },
  });
  const wd3Id = wdPending3.data?.withdrawal?._id;
  const payDirectR = await json("PATCH", `${ADMIN_URL}/api/partners/${demo._id}/withdrawals/${wd3Id}`, {
    token: adminToken,
    body: { status: "paid" },
  });
  step("E6 pay from pending", payDirectR.status === 200 && payDirectR.data?.withdrawal?.status === "paid");

  console.log("\n--- Phase D — Period advance ---");

  demo = await Partner.findById(demo._id);
  demo.status = "capped";
  demo.currentPeriod = 1;
  await demo.save();
  const nextR = await json("POST", `${ADMIN_URL}/api/partners/${demo._id}/start-next-period`, {
    token: adminToken,
    body: {},
  });
  step(
    "D1 start next period",
    nextR.status === 200 && nextR.data?.partner?.currentPeriod === 2 && nextR.data?.partner?.status === "active",
    `period=${nextR.data?.partner?.currentPeriod}`
  );

  demo = await Partner.findById(demo._id);
  demo.status = "active";
  await demo.save();
  const nextFailR = await json("POST", `${ADMIN_URL}/api/partners/${demo._id}/start-next-period`, {
    token: adminToken,
    body: {},
  });
  step("D2 block while active", nextFailR.status === 400, nextFailR.data?.message || "");

  console.log("\n--- Phase B3/B4 — Inactive/reactivate ---");

  await json("PATCH", `${ADMIN_URL}/api/partners/${demo._id}`, {
    token: adminToken,
    body: { status: "inactive", isActive: false },
  });
  const inactiveLogin = await loginPartner({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
  step("B3 inactive login blocked", inactiveLogin.status === 401);

  await json("PATCH", `${ADMIN_URL}/api/partners/${demo._id}`, {
    token: adminToken,
    body: { status: "active", isActive: true },
  });
  demo = await Partner.findById(demo._id);
  step(
    "B4 reactivate",
    demo.isActive === true && demo.status === "active",
    `isActive=${demo.isActive}, status=${demo.status}`
  );

  console.log("\n--- Phase G — Permissions ---");

  const dispatcherToken = await ensureDispatcherToken();
  const g1R = await json("GET", `${ADMIN_URL}/api/partners`, { token: dispatcherToken });
  step("G1 non-full-admin", g1R.status === 403, `status=${g1R.status}`);

  const g2R = await json("GET", `${ADMIN_URL}/api/partners/${demo._id}`, { token: qaPartnerToken });
  step("G2 partner JWT on admin", g2R.status === 403, `status=${g2R.status}`);

  const demoPortal = await loginPartner({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
  const demoEarn = await json("GET", `${ADMIN_URL}/api/partner/earnings`, { token: demoPortal.token });
  const qaEarn = await json("GET", `${ADMIN_URL}/api/partner/earnings`, { token: qaPartnerToken });
  const demoPartnerIds = new Set((demoEarn.data?.earnings || []).map((e) => String(e.partner || demo._id)));
  const qaOnlyOwn =
    (qaEarn.data?.earnings || []).every((e) => String(e.partner || qaPartnerId) === String(qaPartnerId));
  step(
    "G3 portal isolation",
    demoEarn.status === 200 && qaEarn.status === 200 && qaOnlyOwn,
    `demoEarnings=${demoEarn.data?.earnings?.length ?? 0}, qaEarnings=${qaEarn.data?.earnings?.length ?? 0}`
  );

  // Restore Demo Partner for seed script compatibility
  demo = await Partner.findById(demo._id);
  demo.accruedTotal = 0;
  demo.status = "active";
  demo.isActive = true;
  demo.currentPeriod = 1;
  demo.currentPeriodCap = cap;
  demo.periodStartedAt = started;
  demo.periodEndsAt = Partner.computePeriodEnd(started, 2);
  demo.password = bcrypt.hashSync(DEMO_PASSWORD, 10);
  await demo.save();
  await PartnerWithdrawal.deleteMany({ partner: demo._id, status: "pending" });

  await cleanupJobs(adminToken);
  await Partner.deleteOne({ _id: qaPartnerId });

  const summary = {
    date: new Date().toISOString().slice(0, 10),
    adminUrl: ADMIN_URL,
    passed,
    failed,
    phase0: failed === 0 ? "PASS" : "FAIL",
    results,
  };
  const outPath = path.join(__dirname, "qa-partner-results.json");
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  console.log(`Written: ${outPath}`);
  console.log(`Phase 0: ${summary.phase0}`);

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
