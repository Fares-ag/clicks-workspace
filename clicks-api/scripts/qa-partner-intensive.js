#!/usr/bin/env node
/**
 * Intensive partner portal QA — extends qa-partner.js with contract,
 * security, date-lock, and Flutter alignment checks.
 *
 * Run: node scripts/qa-partner-intensive.js
 */
const path = require("path");
const fs = require("fs");
require("../clicks-admin-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-admin-api/.env"),
});

const mongoose = require("mongoose");
const bcrypt = require("../clicks-admin-api/node_modules/bcryptjs");
const Partner = require("../clicks-shared/models/Partner");
const Admin = require("../clicks-shared/models/Admin");
const { generateAccessToken } = require("../clicks-admin-api/src/utils/authUtils");

const ADMIN_URL = (process.env.ADMIN_URL || "http://localhost:5000").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@clicks.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin123!";
const DEMO_EMAIL = "partner@clicks.local";
const DEMO_PASSWORD = "Partner123!";

const FLUTTER_DASHBOARD_PARTNER_KEYS = [
  "accruedTotal",
  "periodCap",
  "remainingToCap",
  "investmentAmount",
  "daysLeft",
  "status",
  "currentPeriod",
  "periodStartedAt",
  "periodEndsAt",
];
const FLUTTER_DASHBOARD_TOP_KEYS = [
  "partner",
  "stats",
  "withdrawAmounts",
  "withdrawAvailable",
  "openWithdrawal",
];
const FLUTTER_STATS_KEYS = ["accruedThisWeek", "accruedThisMonth"];

let passed = 0;
let failed = 0;
let warned = 0;

function pass(name, detail = "") {
  passed += 1;
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail = "") {
  failed += 1;
  console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}
function warn(name, detail = "") {
  warned += 1;
  console.log(`  WARN  ${name}${detail ? ` — ${detail}` : ""}`);
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
  if (r.status !== 200 || !token) throw new Error("Admin login failed");
  return token;
}

async function loginPartner(creds) {
  const r = await json("POST", `${ADMIN_URL}/api/partner/login`, { body: creds });
  return { status: r.status, token: r.data?.token, data: r.data };
}

function checkTranslationParity() {
  const enPath = path.join(__dirname, "../../clicks-partner/assets/translations/en.json");
  const arPath = path.join(__dirname, "../../clicks-partner/assets/translations/ar.json");
  const en = JSON.parse(fs.readFileSync(enPath, "utf8"));
  const ar = JSON.parse(fs.readFileSync(arPath, "utf8"));
  const enKeys = Object.keys(en).sort();
  const arKeys = Object.keys(ar).sort();
  const missingInAr = enKeys.filter((k) => !arKeys.includes(k));
  const missingInEn = arKeys.filter((k) => !enKeys.includes(k));
  if (missingInAr.length === 0 && missingInEn.length === 0) {
    pass("I1 EN/AR translation key parity", `${enKeys.length} keys`);
  } else {
    fail(
      "I1 EN/AR translation key parity",
      `missingInAr=${missingInAr.slice(0, 5).join(",")} missingInEn=${missingInEn.slice(0, 5).join(",")}`
    );
  }

  const requiredKeys = [
    "dashboard",
    "withdraw_title",
    "withdraw_type_earnings",
    "status_capped_title",
    "period_start",
    "period_end",
    "login_failed",
    "profile",
    "change_password",
  ];
  const missingRequired = requiredKeys.filter((k) => !en[k]);
  if (missingRequired.length === 0) {
    pass("I2 required UI translation keys present");
  } else {
    fail("I2 required UI translation keys present", missingRequired.join(", "));
  }
}

function checkFlutterApiUsage() {
  const homePath = path.join(__dirname, "../../clicks-partner/lib/features/home/home_screen.dart");
  const src = fs.readFileSync(homePath, "utf8");
  const usesDashboard = src.includes("EndPoints.dashboard");
  const usesWithdrawals = src.includes("EndPoints.withdrawals");
  const usesEarnings = src.includes("EndPoints.earnings");
  if (usesDashboard && usesWithdrawals) {
    pass("I3 Flutter home uses dashboard + withdrawals endpoints");
  } else {
    fail("I3 Flutter home uses dashboard + withdrawals endpoints");
  }
  if (!usesEarnings) {
    warn("I4 Flutter earnings list not implemented", "GET /api/partner/earnings unused in UI");
  } else {
    pass("I4 Flutter earnings list implemented");
  }
}

async function main() {
  console.log("\n=== Intensive Partner Portal QA ===\n");

  const health = await json("GET", `${ADMIN_URL}/api/health`);
  if (health.status !== 200) {
    console.error("Admin API not reachable");
    process.exit(1);
  }
  pass("H1 admin API health");

  await mongoose.connect(process.env.MONGODB_URI);
  const adminToken = await loginAdmin();
  pass("H2 admin login");

  const demo = await Partner.findOne({ email: DEMO_EMAIL });
  if (!demo) {
    fail("H3 demo partner exists", "Run seed-partner.js first");
    process.exit(1);
  }
  pass("H3 demo partner exists", demo.name);

  console.log("\n--- API contract (Flutter dashboard) ---");

  const login = await loginPartner({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
  if (!login.token) {
    fail("C0 partner login", `status=${login.status}`);
    process.exit(1);
  }
  pass("C0 partner login");

  const dash = await json("GET", `${ADMIN_URL}/api/partner/dashboard`, { token: login.token });
  if (dash.status !== 200) {
    fail("C1 dashboard 200", `status=${dash.status}`);
  } else {
    pass("C1 dashboard 200");
    const missingTop = FLUTTER_DASHBOARD_TOP_KEYS.filter((k) => !(k in dash.data));
    if (missingTop.length === 0) {
      pass("C2 dashboard top-level shape");
    } else {
      fail("C2 dashboard top-level shape", `missing: ${missingTop.join(", ")}`);
    }
    const partner = dash.data.partner || {};
    const missingPartner = FLUTTER_DASHBOARD_PARTNER_KEYS.filter((k) => !(k in partner));
    if (missingPartner.length === 0) {
      pass("C3 dashboard partner fields for Flutter UI");
    } else {
      fail("C3 dashboard partner fields", `missing: ${missingPartner.join(", ")}`);
    }
    const stats = dash.data.stats || {};
    const missingStats = FLUTTER_STATS_KEYS.filter((k) => !(k in stats));
    if (missingStats.length === 0) {
      pass("C4 dashboard stats fields");
    } else {
      fail("C4 dashboard stats fields", `missing: ${missingStats.join(", ")}`);
    }
    if (typeof dash.data.withdrawAvailable === "boolean") {
      pass("C5 withdrawAvailable boolean");
    } else {
      fail("C5 withdrawAvailable boolean");
    }
  }

  const me = await json("GET", `${ADMIN_URL}/api/partner/me`, { token: login.token });
  if (me.status === 200 && me.data?.partner?.email === DEMO_EMAIL) {
    pass("C6 GET /partner/me returns own profile");
  } else {
    fail("C6 GET /partner/me", `status=${me.status}`);
  }

  const earnings = await json("GET", `${ADMIN_URL}/api/partner/earnings?limit=5`, { token: login.token });
  if (earnings.status === 200 && Array.isArray(earnings.data?.earnings)) {
    pass("C7 GET /partner/earnings list", `count=${earnings.data.earnings.length}`);
  } else {
    fail("C7 GET /partner/earnings list", `status=${earnings.status}`);
  }

  const withdrawals = await json("GET", `${ADMIN_URL}/api/partner/withdrawals`, { token: login.token });
  if (withdrawals.status === 200 && Array.isArray(withdrawals.data?.withdrawals)) {
    pass("C8 GET /partner/withdrawals list", `count=${withdrawals.data.withdrawals.length}`);
  } else {
    fail("C8 GET /partner/withdrawals list", `status=${withdrawals.status}`);
  }

  console.log("\n--- Auth variants ---");

  const phoneLogin = await loginPartner({ phone: demo.phone, password: DEMO_PASSWORD });
  if (phoneLogin.token) {
    pass("A1 phone login supported by API");
  } else {
    fail("A1 phone login", `status=${phoneLogin.status}`);
  }

  const noCreds = await loginPartner({});
  if (noCreds.status === 400 || noCreds.status === 401) {
    pass("A2 login without credentials rejected", `status=${noCreds.status}`);
  } else {
    fail("A2 login without credentials", `status=${noCreds.status}`);
  }

  const badToken = await json("GET", `${ADMIN_URL}/api/partner/dashboard`, { token: "invalid.jwt.token" });
  if (badToken.status === 401 || badToken.status === 403) {
    pass("A3 invalid JWT rejected", `status=${badToken.status}`);
  } else {
    fail("A3 invalid JWT rejected", `status=${badToken.status}`);
  }

  console.log("\n--- FCM token endpoints ---");

  const fcmSave = await json("POST", `${ADMIN_URL}/api/partner/fcm-token`, {
    token: login.token,
    body: { token: "qa-fcm-token-test" },
  });
  if (fcmSave.status === 200) {
    pass("F1 POST fcm-token");
  } else {
    warn("F1 POST fcm-token", `status=${fcmSave.status} (Firebase may be optional)`);
  }

  const fcmClear = await json("DELETE", `${ADMIN_URL}/api/partner/fcm-token`, { token: login.token });
  if (fcmClear.status === 200) {
    pass("F2 DELETE fcm-token");
  } else {
    warn("F2 DELETE fcm-token", `status=${fcmClear.status}`);
  }

  console.log("\n--- Period date lock (admin) ---");

  if (demo.periodStartedAt && demo.periodEndsAt) {
    const newStart = new Date(demo.periodStartedAt);
    newStart.setDate(newStart.getDate() + 10);
    const lockR = await json("PATCH", `${ADMIN_URL}/api/partners/${demo._id}`, {
      token: adminToken,
      body: { periodStartedAt: newStart.toISOString() },
    });
    if (lockR.status === 400 && String(lockR.data?.message || "").includes("cannot be changed")) {
      pass("D1 period start date locked");
    } else {
      fail("D1 period start date locked", `status=${lockR.status} msg=${lockR.data?.message}`);
    }

    const capOnly = await json("PATCH", `${ADMIN_URL}/api/partners/${demo._id}`, {
      token: adminToken,
      body: { profitPerPeriod: demo.profitPerPeriod },
    });
    if (capOnly.status === 200) {
      pass("D2 terms editable without date change");
    } else {
      fail("D2 terms editable without date change", `status=${capOnly.status}`);
    }
  } else {
    warn("D1/D2 date lock", "demo partner missing period dates");
  }

  console.log("\n--- Security isolation ---");

  let dispatcher = await Admin.findOne({ email: "qa-dispatcher@clicks.local" });
  if (!dispatcher) {
    dispatcher = await Admin.create({
      firstName: "QA",
      lastName: "Dispatcher",
      role: "Call Center Agent",
      email: "qa-dispatcher@clicks.local",
      phone: "+97455550199",
      password: bcrypt.hashSync("Dispatch123!", 10),
      isActive: true,
    });
  }
  const dispatcherToken = generateAccessToken({
    id: dispatcher._id.toString(),
    role: dispatcher.role,
    email: dispatcher.email,
  });
  const dispPartners = await json("GET", `${ADMIN_URL}/api/partners`, { token: dispatcherToken });
  if (dispPartners.status === 403) {
    pass("S1 dispatcher cannot list partners");
  } else {
    fail("S1 dispatcher cannot list partners", `status=${dispPartners.status}`);
  }

  const partnerOnAdmin = await json("GET", `${ADMIN_URL}/api/partners/${demo._id}`, { token: login.token });
  if (partnerOnAdmin.status === 403) {
    pass("S2 partner JWT blocked from admin routes");
  } else {
    fail("S2 partner JWT on admin routes", `status=${partnerOnAdmin.status}`);
  }

  console.log("\n--- Flutter static checks ---");
  checkTranslationParity();
  checkFlutterApiUsage();

  // Restore demo password in case prior qa-partner changed it
  demo.password = bcrypt.hashSync(DEMO_PASSWORD, 10);
  demo.isActive = true;
  demo.status = "active";
  await demo.save();

  await mongoose.disconnect();

  console.log(`\n=== Intensive results: ${passed} passed, ${failed} failed, ${warned} warnings ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  mongoose.disconnect().finally(() => process.exit(1));
});
