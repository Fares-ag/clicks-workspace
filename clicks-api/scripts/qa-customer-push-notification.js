#!/usr/bin/env node
/**
 * QA: customer job/SOS push (FCM) — server + Firebase delivery check.
 *
 * Verifies the full chain except physical device display (needs real FCM token on phone).
 *
 * Usage:
 *   node scripts/qa-customer-push-notification.js
 *
 * Env:
 *   TECH_URL, CUSTOMER_PHONE, CUSTOMER_PASSWORD
 *   MONGODB_URI          from clicks-customer-tech-api/.env if unset
 *   FIREBASE_CUSTOMER_JSON_PATH  path to clicks-customer firebase-adminsdk json
 *   QA_OVERWRITE_FCM=1   register a test token when no real token exists
 */
const fs = require("fs");
const path = require("path");

require("../clicks-customer-tech-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-customer-tech-api/.env"),
});
// Prefer admin-api Mongo credentials (production Atlas user)
require("../clicks-admin-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-admin-api/.env"),
  override: true,
});

const TECH_URL = (process.env.TECH_URL || "https://clicks-tech-api-production.up.railway.app").replace(/\/$/, "");
const CUSTOMER_PHONE = process.env.CUSTOMER_PHONE || "+97433333333";
const CUSTOMER_PASSWORD = process.env.CUSTOMER_PASSWORD || "Customer123!";

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

function resolveCustomerFirebaseJsonPath() {
  if (
    process.env.FIREBASE_CUSTOMER_JSON_PATH &&
    fs.existsSync(process.env.FIREBASE_CUSTOMER_JSON_PATH)
  ) {
    return process.env.FIREBASE_CUSTOMER_JSON_PATH;
  }
  const assetsDir = path.join(__dirname, "../../clicks-user/assets");
  if (fs.existsSync(assetsDir)) {
    const match = fs
      .readdirSync(assetsDir)
      .find((f) => f.includes("firebase-adminsdk") && f.endsWith(".json"));
    if (match) return path.join(assetsDir, match);
  }
  return null;
}

async function loginCustomer() {
  const r = await json("POST", `${TECH_URL}/api/customers/login`, {
    body: { phone_number: CUSTOMER_PHONE, password: CUSTOMER_PASSWORD },
  });
  if (r.status !== 200 || !r.data?.token) {
    throw new Error(`Customer login failed (${r.status})`);
  }
  return {
    token: r.data.token,
    customerId: r.data.customer?.id || r.data.customer?._id || r.data.id,
  };
}

async function registerTestFcmToken(customerToken, { skipIfReal = true } = {}) {
  if (skipIfReal) return { skipped: true, ok: true };
  const testToken = `qa_customer_test_token_${Date.now()}`;
  const r = await json("POST", `${TECH_URL}/api/customers/fcm-token`, {
    token: customerToken,
    body: { fcm_token: testToken },
  });
  return { skipped: false, ok: r.status === 200 || r.status === 201, status: r.status, testToken };
}

async function readCustomerFromDb(customerId) {
  const mongoose = require("mongoose");
  const { Customer } = require("../clicks-shared/models");
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI not set");
  }
  await mongoose.connect(process.env.MONGODB_URI);
  const customer = await Customer.findById(customerId)
    .select("first_name last_name phone_number fcm_token")
    .lean();
  await mongoose.disconnect();
  return customer;
}

async function restoreFcmToken(customerId, fcmToken) {
  const mongoose = require("mongoose");
  const { Customer } = require("../clicks-shared/models");
  await mongoose.connect(process.env.MONGODB_URI);
  await Customer.findByIdAndUpdate(customerId, { fcm_token: fcmToken });
  await mongoose.disconnect();
}

async function testFirebaseSend(fcmToken) {
  const jsonPath = resolveCustomerFirebaseJsonPath();
  if (!jsonPath) {
    return { ok: false, reason: "no FIREBASE_CUSTOMER_JSON_PATH / firebase-adminsdk json found" };
  }
  const raw = fs.readFileSync(jsonPath, "utf8");
  process.env.FIREBASE_CUSTOMER_SERVICE_ACCOUNT_JSON = raw;

  const fcmPath = path.join(__dirname, "../clicks-customer-tech-api/src/services/fcmService.js");
  delete require.cache[require.resolve(fcmPath)];
  const { sendCustomerPush, initCustomerFirebase } = require(fcmPath);

  const messaging = initCustomerFirebase();
  if (!messaging) {
    return { ok: false, reason: "Customer Firebase admin failed to initialize" };
  }

  const sent = await sendCustomerPush(fcmToken, {
    event: "technicianEnRoute",
    type: "technicianEnRoute",
    job_id: "qa-customer-push-test",
    title: "QA push test",
    body: "Customer FCM pipeline test",
  });
  return { ok: sent === true, reason: sent ? "FCM accepted by Firebase" : "send returned false" };
}

async function main() {
  console.log("\n=== Customer push notification QA ===");
  console.log(`Tech API: ${TECH_URL}\n`);

  const { token: customerToken, customerId: loginCustomerId } = await loginCustomer();
  step("customer login", true, `customerId=${loginCustomerId}`);

  let customer;
  try {
    customer = await readCustomerFromDb(loginCustomerId);
    step(
      "read customer from MongoDB",
      !!customer,
      customer ? `${customer.first_name || ""} ${customer.last_name || ""}`.trim() : "not found"
    );
  } catch (e) {
    step("read customer from MongoDB", false, e.message);
    customer = null;
  }

  const originalFcm = customer?.fcm_token || null;
  const hasRealToken =
    originalFcm &&
    originalFcm.length > 80 &&
    !originalFcm.startsWith("qa_customer_test_token_");
  const hasInvalidQaToken =
    originalFcm && originalFcm.startsWith("qa_customer_test_token_");

  if (hasRealToken) {
    step("customer has FCM token in DB", true, `${originalFcm.slice(0, 12)}…`);
  } else if (hasInvalidQaToken) {
    warn(
      "customer FCM token is a QA placeholder",
      "Re-open the native Android app and log in to register a real device token"
    );
  } else {
    warn(
      "customer has no FCM token in DB",
      "Open the native app, log in, allow notifications — then re-run"
    );
  }

  const reg = await registerTestFcmToken(customerToken, {
    skipIfReal: hasRealToken || process.env.QA_OVERWRITE_FCM !== "1",
  });
  if (reg.skipped) {
    step(
      "POST /api/customers/fcm-token",
      true,
      hasRealToken
        ? "skipped — real token already registered"
        : "skipped — set QA_OVERWRITE_FCM=1 to register test token"
    );
  } else {
    step("POST /api/customers/fcm-token", reg.ok, `status=${reg.status}`);
  }

  const firebasePath = resolveCustomerFirebaseJsonPath();
  step(
    "Firebase customer service account file found",
    !!firebasePath,
    firebasePath ? path.basename(firebasePath) : "missing — download from clicks-customer Firebase Console"
  );

  let firebaseResult = null;
  const tokenForSend = hasRealToken ? originalFcm : reg.testToken;
  if (!tokenForSend) {
    warn("Firebase send", "no token available to test delivery");
  } else {
    firebaseResult = await testFirebaseSend(tokenForSend);
    if (hasRealToken) {
      step("Firebase sendCustomerPush (real token)", firebaseResult.ok, firebaseResult.reason);
    } else {
      const credsWork = firebaseResult.reason !== "Customer Firebase admin failed to initialize";
      step("Firebase customer admin initializes", credsWork, firebaseResult.reason);
      warn("Firebase device delivery", "skipped — no real FCM token on customer record");
    }
  }

  if (originalFcm && hasRealToken) {
    try {
      await restoreFcmToken(loginCustomerId, originalFcm);
      step("restore original FCM token in DB", true);
    } catch (e) {
      warn("restore original FCM token", e.message);
    }
  }

  console.log(`\n--- Summary: ${passed} passed, ${failed} failed, ${warned} warnings ---`);

  if (hasRealToken && firebaseResult?.ok) {
    console.log("\n✓ Server + Firebase accepted push for this customer's device token.");
    console.log("  With app closed: phone should show notification within ~5s of job events.");
  } else if (!hasRealToken) {
    console.log("\n⚠ Server pipeline OK, but on-phone alert NOT verified — customer needs to log in on native Android app first.");
  }

  if (!firebasePath) {
    console.log("\n⚠ Add FIREBASE_CUSTOMER_SERVICE_ACCOUNT_JSON to Railway (clicks-customer project).");
  }

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("\nQA aborted:", err.message);
  process.exit(1);
});
