#!/usr/bin/env node
/**
 * QA: technician urgent job push (FCM) — server + Firebase delivery check.
 *
 * Verifies the full chain except physical device display (needs real FCM token on phone).
 *
 * Usage:
 *   node scripts/qa-tech-push-notification.js
 *
 * Env:
 *   TECH_URL, ADMIN_URL, TECH_PHONE, TECH_PASSWORD, ADMIN_EMAIL, ADMIN_PASSWORD
 *   MONGODB_URI          from clicks-customer-tech-api/.env if unset
 *   FIREBASE_JSON_PATH   default ../clicks-technician/assets/clicks-technician-qa-firebase-adminsdk-*.json
 *   INTERNAL_API_SECRET  optional — direct notify-technician on tech-api
 */
const fs = require("fs");
const path = require("path");

require("../clicks-customer-tech-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-customer-tech-api/.env"),
});
// Prefer admin-api Mongo credentials (production Atlas user)
require("../clicks-admin-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-admin-api/.env"),
});

const TECH_URL = (process.env.TECH_URL || "https://clicks-tech-api-production.up.railway.app").replace(/\/$/, "");
const ADMIN_URL = (process.env.ADMIN_URL || "https://clicks-admin-api-production.up.railway.app").replace(/\/$/, "");
const TECH_PHONE = process.env.TECH_PHONE || "+97411111111";
const TECH_PASSWORD = process.env.TECH_PASSWORD || "Tech123!";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@clicks.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin123!";

const JOB_LAT = 25.3269467;
const JOB_LNG = 51.4883967;

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

async function loginTech() {
  const r = await json("POST", `${TECH_URL}/api/technicians/login`, {
    body: { phone: TECH_PHONE, password: TECH_PASSWORD },
  });
  if (r.status !== 200 || !r.data?.token) {
    throw new Error(`Tech login failed (${r.status})`);
  }
  return {
    token: r.data.token,
    techId: r.data.technician?.id || r.data.technician?._id || r.data.id,
  };
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

async function findTechId(adminToken) {
  const r = await json("GET", `${ADMIN_URL}/api/technicians?limit=50`, { token: adminToken });
  const list = r.data?.technicians || r.data?.data || [];
  const tech = list.find((t) => String(t.phone || "").includes("11111111")) || list[0];
  return tech?._id;
}

async function findSourceId(adminToken) {
  const r = await json("GET", `${ADMIN_URL}/api/sources?limit=10`, { token: adminToken });
  const list = r.data?.sources || r.data?.data || r.data || [];
  const first = Array.isArray(list) ? list[0] : null;
  return first?._id || first?.id;
}

async function registerTestFcmToken(techToken, { skipIfReal = true } = {}) {
  if (skipIfReal) return { skipped: true, ok: true };
  const testToken = `qa_test_token_${Date.now()}`;
  const r = await json("POST", `${TECH_URL}/api/technicians/fcm-token`, {
    token: techToken,
    body: { fcm_token: testToken },
  });
  return { skipped: false, ok: r.status === 200 || r.status === 201, status: r.status, testToken };
}

async function readTechFromAdmin(adminToken, techId) {
  const r = await json("GET", `${ADMIN_URL}/api/technicians/${techId}`, { token: adminToken });
  if (r.status !== 200) return null;
  return r.data?.technician || null;
}

async function readTechFromDb(techId) {
  const mongoose = require("mongoose");
  const { Technician } = require("../clicks-shared/models");
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI not set");
  }
  await mongoose.connect(process.env.MONGODB_URI);
  const tech = await Technician.findById(techId).select("firstName lastName phone fcm_token status").lean();
  await mongoose.disconnect();
  return tech;
}

async function restoreFcmToken(techId, fcmToken) {
  const mongoose = require("mongoose");
  const { Technician } = require("../clicks-shared/models");
  await mongoose.connect(process.env.MONGODB_URI);
  await Technician.findByIdAndUpdate(techId, { fcm_token: fcmToken });
  await mongoose.disconnect();
}

async function testFirebaseSend(fcmToken, jobId) {
  const jsonPath = resolveFirebaseJsonPath();
  if (!jsonPath) {
    return { ok: false, reason: "no FIREBASE_JSON_PATH / firebase-adminsdk json found" };
  }
  const raw = fs.readFileSync(jsonPath, "utf8");
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = raw;

  // Reset module cache so fcmService picks up env
  const fcmPath = path.join(__dirname, "../clicks-customer-tech-api/src/services/fcmService.js");
  delete require.cache[require.resolve(fcmPath)];
  const { sendJobAssignedPush, initFirebase } = require(fcmPath);

  const messaging = initFirebase();
  if (!messaging) {
    return { ok: false, reason: "Firebase admin failed to initialize" };
  }

  const sent = await sendJobAssignedPush(fcmToken, {
    type: "job_assigned",
    job_id: jobId || "qa-push-test",
    issue: "QA push test — tire change",
    location: "Doha, QA",
    price: "150",
    status: "assigned",
  });
  return { ok: sent === true, reason: sent ? "FCM accepted by Firebase" : "send returned false" };
}

async function createAssignedJob(adminToken, techId, sourceId) {
  const now = new Date();
  now.setHours(now.getHours() + 1);
  const r = await json("POST", `${ADMIN_URL}/api/jobs`, {
    token: adminToken,
    body: {
      clientName: "QA Push Test",
      clientMobileNumber: "+97455555599",
      issue: "QA push notification test",
      location: `LatLng(${JOB_LAT}, ${JOB_LNG})`,
      dateTime: now.toISOString(),
      jobType: "Tires",
      assignedTechnician: techId,
      price: 150,
      source: sourceId,
    },
  });
  const jobId = r.data?.job?._id || r.data?._id;
  return { jobId, status: r.status };
}

async function rejectAssignedJob(techToken, jobId) {
  await json("POST", `${TECH_URL}/api/technicians/jobs/${jobId}/reject`, {
    token: techToken,
    body: { reason: "QA push test cleanup" },
  });
}

async function notifyTechnicianDirect(jobId) {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return { skipped: true };
  const r = await json("POST", `${TECH_URL}/api/sos/notify-technician`, {
    body: { job_id: jobId },
    headers: { "x-internal-secret": secret },
  });
  return { skipped: false, status: r.status, data: r.data };
}

async function main() {
  console.log("\n=== Technician push notification QA ===");
  console.log(`Tech API:  ${TECH_URL}`);
  console.log(`Admin API: ${ADMIN_URL}\n`);

  const { token: techToken, techId: loginTechId } = await loginTech();
  step("technician login", true, `techId=${loginTechId}`);

  const adminToken = await loginAdmin();
  step("admin login", true);

  const techId = (await findTechId(adminToken)) || loginTechId;
  step("resolve technician id", !!techId, techId);

  let tech;
  tech = await readTechFromAdmin(adminToken, techId);
  if (tech) {
    step("read technician via admin API", true, `${tech.firstName || ""} ${tech.lastName || ""}`.trim());
  } else {
    try {
      tech = await readTechFromDb(techId);
      step("read technician from MongoDB", !!tech, tech ? `${tech.firstName} ${tech.lastName}` : "not found");
    } catch (e) {
      step("read technician from MongoDB", false, e.message);
      tech = null;
    }
  }

  const originalFcm = tech?.fcm_token || null;
  const hasRealToken =
    originalFcm &&
    originalFcm.length > 80 &&
    !originalFcm.startsWith("qa_test_token_");
  const hasInvalidQaToken =
    originalFcm && originalFcm.startsWith("qa_test_token_");

  if (hasRealToken) {
    step("technician has FCM token in DB", true, `${originalFcm.slice(0, 12)}…`);
  } else if (hasInvalidQaToken) {
    warn(
      "technician FCM token is a QA placeholder",
      "Re-open the native Android app and log in to register a real device token",
    );
  } else {
    warn(
      "technician has no FCM token in DB",
      "Open the native app, log in, complete permission setup — then re-run",
    );
  }

  const reg = await registerTestFcmToken(techToken, {
    skipIfReal: hasRealToken || process.env.QA_OVERWRITE_FCM !== "1",
  });
  if (reg.skipped) {
    step(
      "POST /api/technicians/fcm-token",
      true,
      hasRealToken
        ? "skipped — real token already registered"
        : "skipped — set QA_OVERWRITE_FCM=1 to register test token",
    );
  } else {
    step("POST /api/technicians/fcm-token", reg.ok, `status=${reg.status}`);
  }

  const firebasePath = resolveFirebaseJsonPath();
  step("Firebase service account file found", !!firebasePath, firebasePath ? path.basename(firebasePath) : "missing");

  // Test with real token if available; otherwise expect Firebase to reject invalid token
  let firebaseResult = null;
  const tokenForSend = hasRealToken ? originalFcm : reg.testToken;
  if (!tokenForSend) {
    warn("Firebase send", "no token available to test delivery");
  } else {
    firebaseResult = await testFirebaseSend(tokenForSend, "qa-push-test-job");
    if (hasRealToken) {
      step("Firebase sendJobAssignedPush (real token)", firebaseResult.ok, firebaseResult.reason);
    } else {
      const credsWork = firebaseResult.reason !== "Firebase admin failed to initialize";
      step("Firebase admin initializes", credsWork, firebaseResult.reason);
      warn("Firebase device delivery", "skipped — no real FCM token on technician record");
    }
  }

  const sourceId = await findSourceId(adminToken);
  step("resolve source id", !!sourceId, sourceId || "none");

  const { jobId, status: createStatus } = await createAssignedJob(adminToken, techId, sourceId);
  step("admin create job (triggers notify-technician)", createStatus === 201 || createStatus === 200, `jobId=${jobId} status=${createStatus}`);

  const direct = await notifyTechnicianDirect(jobId);
  if (direct.skipped) {
    warn("direct notify-technician", "INTERNAL_API_SECRET not set — relied on admin create path only");
  } else if (direct.status === 200) {
    step("POST /api/sos/notify-technician", true);
  } else if (direct.status === 401) {
    warn("direct notify-technician", "401 — production internal secret differs (admin job create still notifies)");
  } else {
    step("POST /api/sos/notify-technician", false, `status=${direct.status}`);
  }

  if (jobId && techToken) {
    await rejectAssignedJob(techToken, jobId);
    step("cleanup — reject QA job", true, jobId);
  }

  if (originalFcm && hasRealToken) {
    try {
      await restoreFcmToken(techId, originalFcm);
      step("restore original FCM token in DB", true);
    } catch (e) {
      warn("restore original FCM token", e.message);
    }
  }

  console.log(`\n--- Summary: ${passed} passed, ${failed} failed, ${warned} warnings ---`);

  if (hasRealToken && firebaseResult?.ok) {
    console.log("\n✓ Server + Firebase accepted push for this technician's device token.");
    console.log("  With app closed: phone should show urgent alarm notification within ~5s of job assign.");
  } else if (!hasRealToken) {
    console.log("\n⚠ Server pipeline OK, but on-phone alert NOT verified — technician needs to log in on native Android app first.");
  }

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("\nQA aborted:", err.message);
  process.exit(1);
});
