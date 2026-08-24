#!/usr/bin/env node
/**
 * QA: Business portal job submit → admin popup (socket newBusinessJob).
 *
 * Usage:
 *   node scripts/qa-business-portal-admin-popup.js
 *
 * Env:
 *   ADMIN_URL              default production admin API
 *   TECH_URL               default production tech API (sockets)
 *   ADMIN_EMAIL            default admin@clicks.local
 *   ADMIN_PASSWORD         default Admin123!
 *   BUSINESS_EMAIL         default business@clicks.local
 *   BUSINESS_PASSWORD      default Business123!
 *   INTERNAL_API_SECRET    optional — for direct notify endpoint test
 */
const path = require("path");
require("../clicks-admin-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-admin-api/.env"),
});
require("../clicks-customer-tech-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-customer-tech-api/.env"),
});

const { io } = require("./node_modules/socket.io-client");

const ADMIN_URL = (
  process.env.ADMIN_URL || "https://clicks-admin-api-production.up.railway.app"
).replace(/\/$/, "");
const TECH_URL = (
  process.env.TECH_URL || "https://clicks-tech-api-production.up.railway.app"
).replace(/\/$/, "");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@clicks.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin123!";
const BUSINESS_EMAIL = process.env.BUSINESS_EMAIL || "business@clicks.local";
const BUSINESS_PASSWORD = process.env.BUSINESS_PASSWORD || "Business123!";
const INTERNAL_API_SECRET =
  process.env.INTERNAL_API_SECRET ||
  process.env.INTERNAL_SECRET ||
  "";

const JOB_LAT = 25.3269467;
const JOB_LNG = 51.4883967;

let passed = 0;
let failed = 0;

function step(name, ok, detail = "") {
  const mark = ok ? "PASS" : "FAIL";
  console.log(`${mark}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (ok) passed += 1;
  else failed += 1;
  return ok;
}

async function json(method, url, { token, body, headers: extraHeaders } = {}) {
  const headers = { ...(extraHeaders || {}) };
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
    data = { raw: text.slice(0, 300) };
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
  return { token, user: r.data?.user };
}

async function loginBusiness() {
  const r = await json("POST", `${ADMIN_URL}/api/business/auth/login`, {
    body: { email: BUSINESS_EMAIL, password: BUSINESS_PASSWORD },
  });
  const token = r.data?.accessToken || r.data?.token;
  if (r.status !== 200 || !token) {
    throw new Error(`Business login failed (${r.status}): ${JSON.stringify(r.data).slice(0, 120)}`);
  }
  return { token, business: r.data?.business };
}

async function pickVehicleMake(businessToken) {
  const r = await json("GET", `${ADMIN_URL}/api/business/vehicle-makes`, {
    token: businessToken,
  });
  const makes = r.data?.makes || [];
  if (!makes.length) throw new Error("No vehicle makes for business portal");
  return makes[0];
}

async function pickVehicleModel(businessToken, makeId) {
  const r = await json(
    "GET",
    `${ADMIN_URL}/api/business/vehicle-models/by-make/${makeId}`,
    { token: businessToken }
  );
  const models = r.data?.models || [];
  if (!models.length) throw new Error("No vehicle models for make");
  return models[0];
}

function waitForSocketEvent(socket, event, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`timeout waiting for ${event}`));
    }, timeoutMs);
    function onEvent(payload) {
      clearTimeout(timer);
      socket.off(event, onEvent);
      resolve(payload);
    }
    socket.on(event, onEvent);
  });
}

async function connectAdminSocket(adminToken, adminUserId) {
  const socket = io(`${TECH_URL}/admin`, {
    transports: ["websocket", "polling"],
    auth: { token: adminToken },
  });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("admin socket connect timeout")), 15000);
    socket.on("connect", () => {
      clearTimeout(t);
      resolve();
    });
    socket.on("connect_error", (err) => {
      clearTimeout(t);
      reject(err);
    });
  });
  socket.emit("register", adminUserId);
  return socket;
}

async function main() {
  console.log(`ADMIN_URL=${ADMIN_URL}`);
  console.log(`TECH_URL=${TECH_URL}\n`);

  let adminToken;
  let adminUser;
  let businessToken;
  let business;
  let adminSocket;

  try {
    ({ token: adminToken, user: adminUser } = await loginAdmin());
    step("admin login", true, ADMIN_EMAIL);
  } catch (e) {
    step("admin login", false, e.message);
    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    process.exit(1);
  }

  try {
    ({ token: businessToken, business } = await loginBusiness());
    step("business portal login", true, BUSINESS_EMAIL);
  } catch (e) {
    step("business portal login", false, e.message);
    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    process.exit(1);
  }

  const adminUserId = adminUser?.id || adminUser?._id;
  try {
    adminSocket = await connectAdminSocket(adminToken, adminUserId);
    step("admin socket connected (/admin + JWT)", true);
  } catch (e) {
    step("admin socket connected (/admin + JWT)", false, e.message);
  }

  let make;
  let model;
  try {
    make = await pickVehicleMake(businessToken);
    model = await pickVehicleModel(businessToken, make._id);
    step("business vehicle catalog", true, `${make.makeName} / ${model.modelName}`);
  } catch (e) {
    step("business vehicle catalog", false, e.message);
    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    process.exit(1);
  }

  const phoneSuffix = String(Date.now()).slice(-7);
  const scheduled = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  let socketWait;
  if (adminSocket) {
    socketWait = waitForSocketEvent(adminSocket, "newBusinessJob", 15000);
  }

  const createR = await json("POST", `${ADMIN_URL}/api/business/jobs`, {
    token: businessToken,
    body: {
      clientName: "QA Portal Customer",
      clientMobileNumber: `555${phoneSuffix}`,
      countryCode: "+974",
      clientEmail: "",
      vehicleMake: make.makeName,
      vehicleModel: model.modelName,
      vehicleYear: 2022,
      licensePlate: `QA${phoneSuffix.slice(-4)}`,
      issue: "QA business portal — admin popup test",
      location: `LatLng(${JOB_LAT}, ${JOB_LNG})`,
      dateTime: scheduled,
      jobType: "Flat tire",
      price: 199,
    },
  });

  const jobId = createR.data?.job?._id;
  step(
    "business POST /api/business/jobs → 201",
    createR.status === 201 && !!jobId,
    `status=${createR.status} job=${jobId || "?"}`
  );

  const adminsNotified = createR.data?.adminsNotified === true;
  step(
    "adminsNotified=true in create response",
    adminsNotified,
    adminsNotified
      ? "internal notify path OK"
      : `adminsNotified=${createR.data?.adminsNotified} — check CUSTOMER_TECH_API_URL + INTERNAL_API_SECRET on admin-api`
  );

  if (jobId) {
    const pendingR = await json(
      "GET",
      `${ADMIN_URL}/api/jobs?status=pending&businessPortal=true&limit=5`,
      { token: adminToken }
    );
    const jobs = pendingR.data?.jobs || [];
    const found = jobs.some((j) => String(j._id) === String(jobId));
    step(
      "admin pending businessPortal job list",
      pendingR.status === 200 && found,
      found ? "job visible for sidebar badge" : "job not in businessPortal pending filter"
    );
  }

  if (adminSocket && socketWait) {
    try {
      const payload = await socketWait;
      const match =
        payload &&
        String(payload.job_id || payload.id) === String(jobId) &&
        (payload.businessName || payload.companyName);
      step(
        "admin socket received newBusinessJob (popup source)",
        !!match,
        match
          ? `business=${payload.businessName || payload.companyName}`
          : JSON.stringify(payload).slice(0, 120)
      );
    } catch (e) {
      step("admin socket received newBusinessJob (popup source)", false, e.message);
    }
    adminSocket.disconnect();
  } else {
    step(
      "admin socket received newBusinessJob (popup source)",
      false,
      "skipped — socket not connected"
    );
  }

  if (INTERNAL_API_SECRET && jobId) {
    const direct = await json("POST", `${TECH_URL}/api/sos/notify-business-job`, {
      headers: { "x-internal-secret": INTERNAL_API_SECRET },
      body: {
        job_id: jobId,
        business_id: business?.id || "qa",
        businessName: business?.name || "QA Business",
        sourceLabel: "Business Portal",
        companyName: business?.name || "QA Business",
        clientName: "QA Direct Notify",
        issue: "Direct internal notify test",
        status: "pending",
      },
    });
    step(
      "direct POST /api/sos/notify-business-job",
      direct.status === 200,
      `status=${direct.status}`
    );
  } else {
    console.log("SKIP  direct notify test — set INTERNAL_API_SECRET to run");
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
