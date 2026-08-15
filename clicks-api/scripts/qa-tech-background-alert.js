#!/usr/bin/env node
/**
 * QA: Technician background job alert (closed app) — full staged checklist.
 *
 * Phases:
 *   0 — Pass/fail criteria
 *   1 — Device preconditions (printed checklist; operator fills on phone)
 *   2 — Server + Firebase proof (automated)
 *   3 — Device matrix instructions + optional live FCM (Test D)
 *   4 — logcat capture instructions
 *   5 — Root-cause classification from recorded results
 *
 * Usage:
 *   node scripts/qa-tech-background-alert.js              # server + print device steps
 *   node scripts/qa-tech-background-alert.js --send-live  # Test D: direct FCM to device
 *   node scripts/qa-tech-background-alert.js --classify \
 *     --test-a=pass --test-b=fail --test-c=fail --test-d=fail --test-e=modal_only
 *
 * Env: same as qa-tech-push-notification.js
 */
const fs = require("fs");
const path = require("path");

require("../clicks-customer-tech-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-customer-tech-api/.env"),
});
require("../clicks-admin-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-admin-api/.env"),
  override: true,
});

const TECH_URL = (process.env.TECH_URL || "https://clicks-tech-api-production.up.railway.app").replace(/\/$/, "");
const ADMIN_URL = (process.env.ADMIN_URL || "https://clicks-admin-api-production.up.railway.app").replace(/\/$/, "");
const TECH_PHONE = process.env.TECH_PHONE || "+97411111111";
const TECH_PASSWORD = process.env.TECH_PASSWORD || "Tech123!";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@clicks.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin123!";

const RESULTS_PATH = path.join(__dirname, "qa-tech-background-alert-results.json");

const args = process.argv.slice(2);
const sendLive = args.includes("--send-live");
const classifyOnly = args.includes("--classify");

function argValue(name) {
  const i = args.indexOf(name);
  if (i === -1) return null;
  return args[i + 1] || null;
}

function parseTestArg(name) {
  const eqPrefix = `${name}=`;
  const eqArg = args.find((a) => a.startsWith(eqPrefix));
  if (eqArg) {
    const v = eqArg.slice(eqPrefix.length).toLowerCase();
    if (["pass", "fail", "skip", "modal_only", "notif_on_open"].includes(v)) return v;
  }
  const v = argValue(name);
  if (!v) return null;
  const n = v.toLowerCase();
  if (["pass", "fail", "skip", "modal_only", "notif_on_open"].includes(n)) return n;
  return null;
}

let passed = 0;
let failed = 0;
let warned = 0;

function step(name, ok, detail = "") {
  const mark = ok ? "PASS" : "FAIL";
  console.log(`${mark}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (ok) passed++;
  else failed++;
  return ok;
}

function warn(name, detail = "") {
  console.log(`WARN  ${name}${detail ? ` — ${detail}` : ""}`);
  warned++;
}

function section(title) {
  console.log(`\n${"=".repeat(60)}\n${title}\n${"=".repeat(60)}`);
}

async function json(method, url, { token, body, headers: extra = {} } = {}) {
  const headers = { ...extra };
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body != null) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(url, { method, headers, body: payload });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 200) };
  }
  return { status: res.status, data };
}

function resolveFirebaseJsonPath() {
  if (process.env.FIREBASE_JSON_PATH && fs.existsSync(process.env.FIREBASE_JSON_PATH)) {
    return process.env.FIREBASE_JSON_PATH;
  }
  const assetsDir = path.join(__dirname, "../../clicks-technician/assets");
  if (fs.existsSync(assetsDir)) {
    const match = fs.readdirSync(assetsDir).find((f) => f.includes("firebase-adminsdk") && f.endsWith(".json"));
    if (match) return path.join(assetsDir, match);
  }
  return null;
}

function readFirebaseProjectId(jsonPath) {
  try {
    const j = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    return j.project_id || null;
  } catch {
    return null;
  }
}

function printPhase0() {
  section("Phase 0 — Pass / fail criteria");
  console.log(`
PASS: Within ~10s of admin assign, app FORCE-STOPPED, screen off:
      System notification in shade ("New job assigned")
      Channel: "Urgent jobs (alarm)" / clicks_job_urgent_v4
      Alarm sound/vibrate WITHOUT opening the app

FAIL: Nothing until app opened; OR only Incoming Job modal after open (no tray notif)
`);
}

function printPhase1() {
  section("Phase 1 — Device preconditions (operator checklist)");
  console.log(`
[ ] Native Android build (NOT Chrome/web)
[ ] Logged in as test tech (${TECH_PHONE}); waited 15s after home loads
[ ] Notifications permission granted
[ ] Full-screen / display-over-apps (if prompted)
[ ] DND / notification policy access granted
[ ] Battery → Unrestricted for Clicks Technician
[ ] Notification channel "Urgent jobs (alarm)" exists with sound ON
[ ] For hard test: App info → Force stop (not just swipe away)

Expected Firebase project on device: clicks-technician-qa (see google-services.json)
`);
}

function printPhase3Instructions(jobId) {
  section("Phase 3 — Device test matrix (manual on phone)");
  console.log(`
Use admin UI to assign jobs to ${TECH_PHONE}, or job from Phase 2: ${jobId || "(run server phase first)"}

Test A — Foreground: app open on home → assign job
  Expect: Incoming modal + looping alarm within ~5s

Test B — Background: press Home (app in recents) → assign job
  Expect: system notification + sound within ~10s WITHOUT opening app

Test C — Force stop: App info → Force stop → assign job
  Expect: same as B (hardest case for data-only FCM)

Test D — Direct FCM only (no admin job dependency):
  Run: node scripts/qa-tech-background-alert.js --send-live
  App force-stopped BEFORE running. Expect notification within ~10s.

Test E — After B/C/D silent: open app (do not clear data)
  Record: modal_only | notif_on_open | nothing

Cleanup: reject/cancel each QA job after testing.

Record results:
  node scripts/qa-tech-background-alert.js --classify \\
    --test-a=pass --test-b=fail --test-c=fail --test-d=fail --test-e=modal_only
`);
}

function printPhase4() {
  section("Phase 4 — logcat (when Phase 3 fails)");
  console.log(`
PowerShell (device USB debugging):
  .\\scripts\\qa-tech-background-alert-logcat.ps1

Or manually:
  adb logcat -s flutter JobNotif FirebaseMessaging flutter_local_notifications

Look for:
  [JobNotif] showed insistent urgent notif ... bg=true  → handler ran
  (no JobNotif lines while server sent FCM)             → delivery blocked
  Firebase.initializeApp failed                         → background isolate broken
`);
}

function classify(results) {
  section("Phase 5 — Root-cause classification");

  const {
    phase2FcmSend,
    hasRealToken,
    testA,
    testB,
    testC,
    testD,
    testE,
  } = results;

  let bucket = "unknown";
  let recommendation = "";

  if (!hasRealToken) {
    bucket = "no_fcm_token";
    recommendation =
      "Technician never registered FCM token. Log in on native Android, grant notifications, wait 15s, re-run Phase 2.";
  } else if (!phase2FcmSend) {
    bucket = "server_firebase_misconfigured";
    recommendation =
      "Set FIREBASE_SERVICE_ACCOUNT_JSON on Railway tech-api (clicks-technician-qa project). Redeploy and re-run Phase 2.";
  } else if (testA === "fail") {
    bucket = "in_app_delivery_broken";
    recommendation =
      "Foreground socket/session/UI broken. Fix WebSocket newJobAssigned + HomeCubit before background FCM.";
  } else if (testB === "pass" && testC === "pass") {
    bucket = "pass_all_hard_cases";
    recommendation = "Background alerts working. No code change required.";
  } else if (testB === "pass" && testC === "fail") {
    bucket = "force_stop_oem_limit";
    recommendation =
      "Background works in recents but not force-stop. Consider hybrid FCM (notification + data payload) in sendJobAssignedPush.";
  } else if (testD === "pass" && testB === "fail") {
    bucket = "admin_notify_path_broken";
    recommendation =
      "Direct FCM works but admin assign silent. Check admin→notify-technician and INTERNAL_API_SECRET on admin-api.";
  } else if (testB === "fail" && testE === "notif_on_open") {
    bucket = "deferred_fcm_on_process_start";
    recommendation =
      "FCM queued until app start. Background isolate may not run under OEM restrictions; add notification payload for wake.";
  } else if (testB === "fail" && testE === "modal_only") {
    bucket = "fcm_not_displayed_session_hydrate";
    recommendation =
      "Job appears on open via session/socket only. Background FCM handler not showing system notification — fix data-only delivery or add notification payload.";
  } else if (testD === "fail" && phase2FcmSend) {
    bucket = "device_oem_or_token_mismatch";
    recommendation =
      "Firebase accepts token but device silent. Check Unrestricted battery, DND bypass, SenderId match, Play Services.";
  } else if (testE === "modal_only") {
    bucket = "fcm_not_displayed_session_hydrate";
    recommendation =
      "Job appears on open via session/socket only. Background FCM handler not showing system notification — fix data-only delivery or add notification payload.";
  } else if (testE === "notif_on_open") {
    bucket = "deferred_fcm_on_process_start";
    recommendation =
      "FCM queued until app start. Background isolate may not run under OEM restrictions; add notification payload for wake.";
  } else {
    bucket = "oem_or_handler";
    recommendation =
      "Background FCM likely blocked or handler failed. Run Phase 4 logcat during Test C; verify battery unrestricted.";
  }

  console.log(`Bucket: ${bucket}`);
  console.log(`Recommendation: ${recommendation}\n`);

  return { bucket, recommendation };
}

async function runServerPhase() {
  const out = {
    timestamp: new Date().toISOString(),
    techUrl: TECH_URL,
    techPhone: TECH_PHONE,
    hasRealToken: false,
    fcmTokenPrefix: null,
    phase2FcmSend: false,
    firebaseProjectId: null,
    firebaseJsonFound: false,
    jobId: null,
    testA: null,
    testB: null,
    testC: null,
    testD: null,
    testE: null,
  };

  section("Phase 2 — Server + Firebase proof");

  const loginR = await json("POST", `${TECH_URL}/api/technicians/login`, {
    body: { phone: TECH_PHONE, password: TECH_PASSWORD },
  });
  if (loginR.status !== 200 || !loginR.data?.token) {
    throw new Error(`Technician login failed (${loginR.status})`);
  }
  const techToken = loginR.data.token;
  const techId = loginR.data.technician?.id || loginR.data.technician?._id || loginR.data.id;
  step("technician login", true, `techId=${techId}`);

  let tech = null;
  if (process.env.MONGODB_URI) {
    const mongoose = require("../clicks-shared/node_modules/mongoose");
    const { Technician } = require("../clicks-shared/models");
    await mongoose.connect(process.env.MONGODB_URI);
    tech = await Technician.findById(techId).select("firstName lastName phone fcm_token").lean();
    await mongoose.disconnect();
    step("read technician from MongoDB", !!tech, tech ? `${tech.firstName} ${tech.lastName}` : "not found");
  } else {
    warn("MongoDB", "MONGODB_URI not set — cannot verify fcm_token in DB");
  }

  const originalFcm = tech?.fcm_token || null;
  const hasRealToken =
    originalFcm && originalFcm.length > 80 && !originalFcm.startsWith("qa_test_token_");
  out.hasRealToken = hasRealToken;
  out.fcmTokenPrefix = originalFcm ? originalFcm.slice(0, 16) : null;

  if (hasRealToken) {
    step("technician has FCM token in DB", true, `${originalFcm.slice(0, 12)}…`);
  } else {
    warn("technician FCM token", "missing or placeholder — complete Phase 1 on native app first");
  }

  const firebasePath = resolveFirebaseJsonPath();
  out.firebaseJsonFound = !!firebasePath;
  if (firebasePath) {
    out.firebaseProjectId = readFirebaseProjectId(firebasePath);
    step("Firebase service account file", true, `${path.basename(firebasePath)} project=${out.firebaseProjectId}`);
  } else {
    step("Firebase service account file", false, "missing firebase-adminsdk json");
  }

  const localHasFirebaseEnv = !!(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON &&
    String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON).trim()
  );
  if (localHasFirebaseEnv) {
    step("local FIREBASE_SERVICE_ACCOUNT_JSON", true, "set in .env");
  } else {
    warn(
      "local FIREBASE_SERVICE_ACCOUNT_JSON",
      "not in .env — production Railway must have it for live pushes",
    );
  }

  let firebaseOk = false;
  if (hasRealToken && firebasePath) {
    const raw = fs.readFileSync(firebasePath, "utf8");
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = raw;
    const fcmPath = path.join(__dirname, "../clicks-customer-tech-api/src/services/fcmService.js");
    delete require.cache[require.resolve(fcmPath)];
    const { sendJobAssignedPush, initFirebase } = require(fcmPath);
    if (initFirebase()) {
      const sent = await sendJobAssignedPush(originalFcm, {
        type: "job_assigned",
        job_id: "qa-bg-alert-server-check",
        issue: "QA background alert server check",
        location: "Doha",
        price: "0",
        status: "assigned",
      });
      firebaseOk = sent === true;
      step("Firebase sendJobAssignedPush (real token)", firebaseOk, firebaseOk ? "FCM accepted" : "send returned false");
    } else {
      step("Firebase admin init", false, "initFirebase returned null");
    }
  } else if (!hasRealToken) {
    warn("Firebase send", "skipped — no real token");
  }

  out.phase2FcmSend = firebaseOk;

  const adminLogin = await json("POST", `${ADMIN_URL}/api/auth/login`, {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  const adminToken = adminLogin.data?.accessToken || adminLogin.data?.token;
  step("admin login", adminLogin.status === 200 && !!adminToken);

  if (adminToken && techId) {
    const srcR = await json("GET", `${ADMIN_URL}/api/sources?limit=5`, { token: adminToken });
    const sources = srcR.data?.sources || srcR.data?.data || srcR.data || [];
    const sourceId = Array.isArray(sources) && sources[0] ? sources[0]._id || sources[0].id : null;

    const now = new Date();
    now.setHours(now.getHours() + 1);
    const jobR = await json("POST", `${ADMIN_URL}/api/jobs`, {
      token: adminToken,
      body: {
        clientName: "QA Background Alert",
        clientMobileNumber: "+97455555598",
        issue: "QA background alert matrix",
        location: "LatLng(25.3269467, 51.4883967)",
        dateTime: now.toISOString(),
        jobType: "Tires",
        assignedTechnician: techId,
        price: 150,
        source: sourceId,
      },
    });
    const jobId = jobR.data?.job?._id || jobR.data?._id;
    out.jobId = jobId;
    step(
      "admin create job (notify-technician path)",
      jobR.status === 201 || jobR.status === 200,
      `jobId=${jobId} status=${jobR.status}`,
    );

    if (jobId && techToken) {
      await json("POST", `${TECH_URL}/api/technicians/jobs/${jobId}/reject`, {
        token: techToken,
        body: { reason: "QA background alert cleanup" },
      });
      step("cleanup QA job", true, jobId);
    }
  }

  fs.writeFileSync(RESULTS_PATH, JSON.stringify(out, null, 2));
  console.log(`\nResults saved: ${RESULTS_PATH}`);

  return out;
}

async function sendLiveFcm() {
  section("Test D — Live direct FCM (force-stop app on phone first)");

  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI required");
  }

  const loginR = await json("POST", `${TECH_URL}/api/technicians/login`, {
    body: { phone: TECH_PHONE, password: TECH_PASSWORD },
  });
  const techId = loginR.data.technician?.id || loginR.data.technician?._id || loginR.data.id;

  const mongoose = require("../clicks-shared/node_modules/mongoose");
  const { Technician } = require("../clicks-shared/models");
  await mongoose.connect(process.env.MONGODB_URI);
  const tech = await Technician.findById(techId).select("fcm_token firstName lastName").lean();
  await mongoose.disconnect();

  const token = tech?.fcm_token;
  if (!token || token.length < 80) {
    throw new Error("No real FCM token — complete Phase 1 on device first");
  }

  const firebasePath = resolveFirebaseJsonPath();
  if (!firebasePath) throw new Error("Firebase adminsdk json not found");

  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = fs.readFileSync(firebasePath, "utf8");
  const fcmPath = path.join(__dirname, "../clicks-customer-tech-api/src/services/fcmService.js");
  delete require.cache[require.resolve(fcmPath)];
  const { sendJobAssignedPush, initFirebase } = require(fcmPath);

  if (!initFirebase()) throw new Error("Firebase admin init failed");

  const jobId = `qa-live-${Date.now()}`;
  const sent = await sendJobAssignedPush(token, {
    type: "job_assigned",
    job_id: jobId,
    issue: "LIVE QA — background alert test",
    location: "Doha, QA",
    price: "150",
    status: "assigned",
  });

  if (sent) {
    console.log(`\nPASS  Live FCM sent job_id=${jobId}`);
    console.log("      Phone should show urgent notification within ~10s (app force-stopped).");
  } else {
    console.log("\nFAIL  Live FCM send returned false");
    process.exit(1);
  }

  let results = {};
  if (fs.existsSync(RESULTS_PATH)) {
    results = JSON.parse(fs.readFileSync(RESULTS_PATH, "utf8"));
  }
  results.testD = sent ? "pass" : "fail";
  results.lastLiveSendAt = new Date().toISOString();
  results.lastLiveJobId = jobId;
  fs.writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2));
}

async function main() {
  console.log("\n=== Technician background job-alert QA ===\n");

  printPhase0();

  if (classifyOnly) {
    let results = {};
    if (fs.existsSync(RESULTS_PATH)) {
      results = JSON.parse(fs.readFileSync(RESULTS_PATH, "utf8"));
    }
    results.testA = parseTestArg("--test-a") || results.testA;
    results.testB = parseTestArg("--test-b") || results.testB;
    results.testC = parseTestArg("--test-c") || results.testC;
    results.testD = parseTestArg("--test-d") || results.testD;
    results.testE = parseTestArg("--test-e") || results.testE;
    fs.writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2));
    const { bucket, recommendation } = classify(results);
    results.rootCauseBucket = bucket;
    results.recommendation = recommendation;
    fs.writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2));
    console.log(`Updated: ${RESULTS_PATH}`);
    return;
  }

  if (sendLive) {
    printPhase1();
    await sendLiveFcm();
    printPhase4();
    return;
  }

  printPhase1();
  const serverResults = await runServerPhase();
  printPhase3Instructions(serverResults.jobId);
  printPhase4();

  console.log(`\n--- Server summary: ${passed} passed, ${failed} failed, ${warned} warnings ---`);

  if (serverResults.hasRealToken && serverResults.phase2FcmSend) {
    console.log(
      "\nNext: complete Phase 3 on device, then classify with --classify flags.",
    );
    console.log("  Test D shortcut: node scripts/qa-tech-background-alert.js --send-live");
  } else if (!serverResults.hasRealToken) {
    console.log("\nStop: fix FCM token on device (Phase 1) before device matrix.");
  } else {
    console.log("\nStop: fix server Firebase config before device matrix.");
  }

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("\nQA aborted:", err.message);
  process.exit(1);
});
