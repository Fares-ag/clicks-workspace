#!/usr/bin/env node
/**
 * Job Dispatcher RBAC QA — static matrix + live API checks.
 *
 * Usage:
 *   node scripts/qa-dispatcher-rbac.js
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
const Admin = require("../clicks-shared/models/Admin");
const { generateAccessToken } = require("../clicks-admin-api/src/utils/authUtils");
const {
  FULL_ACCESS,
  OPS_ACCESS,
  requireFullAdmin,
  requireOps,
} = require("../clicks-admin-api/src/middleware/rbac");

const ADMIN_URL = (process.env.ADMIN_URL || "http://localhost:5000").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@clicks.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin123!";
const DISPATCHER_EMAIL = "qa-job-dispatcher@clicks.local";
const DISPATCHER_PASSWORD = "Dispatch123!";

const FULL_ADMIN_ROLES = ["Super Admin", "Admin"];
const OPS_ROLES = [
  "Super Admin",
  "Admin",
  "Job Dispatcher",
  "Coordinator",
  "Call Center Agent",
];
const FULL_ADMIN_ONLY_PREFIXES = [
  "/admin-management",
  "/heat-map",
  "/performance",
  "/sources",
  "/businesses",
  "/partners",
  "/vehicle-makes",
  "/vehicle-models",
  "/calls",
];
const OPS_ALLOWED_PREFIXES = [
  "/dashboard",
  "/technicians",
  "/vehicles",
  "/live-map",
  "/jobs",
  "/leads",
  "/sos",
  "/service-requests",
  "/clients",
  "/support-tickets",
];

function isFullAdmin(role) {
  return FULL_ADMIN_ROLES.includes(role);
}

function isOpsRole(role) {
  return OPS_ROLES.includes(role);
}

function canAccessPath(role, pathname = "") {
  if (!role) return false;
  if (isFullAdmin(role)) return true;
  if (!isOpsRole(role)) return false;
  const pathOnly = pathname.split("?")[0];
  if (FULL_ADMIN_ONLY_PREFIXES.some((prefix) => pathOnly.startsWith(prefix))) {
    return false;
  }
  return OPS_ALLOWED_PREFIXES.some((prefix) => pathOnly.startsWith(prefix));
}

const NAV_PATHS = [
  "/dashboard",
  "/admin-management",
  "/technicians",
  "/vehicles",
  "/live-map",
  "/heat-map",
  "/jobs",
  "/leads",
  "/businesses",
  "/sos",
  "/service-requests",
  "/performance",
  "/sources",
  "/partners",
  "/support-tickets",
];

const DISPATCHER_EXPECT_ALLOW = [
  "/dashboard",
  "/technicians",
  "/vehicles",
  "/live-map",
  "/jobs",
  "/jobs/new",
  "/leads",
  "/leads/new",
  "/sos",
  "/service-requests",
  "/clients",
  "/support-tickets",
];

const DISPATCHER_EXPECT_DENY = [
  "/admin-management",
  "/heat-map",
  "/performance",
  "/sources",
  "/businesses",
  "/partners",
  "/vehicle-makes",
];

/** API: dispatcher should succeed (2xx or empty list). */
const OPS_API_ALLOW = [
  { method: "GET", path: "/api/dashboard/summary" },
  { method: "GET", path: "/api/dashboard/job-completion" },
  { method: "GET", path: "/api/jobs?limit=1" },
  { method: "GET", path: "/api/leads?limit=1" },
  { method: "GET", path: "/api/sos?limit=1" },
  { method: "GET", path: "/api/service-requests?limit=1" },
  { method: "GET", path: "/api/technicians?limit=1" },
  { method: "GET", path: "/api/technicians/live-map" },
  { method: "GET", path: "/api/vehicles?limit=1" },
  { method: "GET", path: "/api/customers?limit=1" },
  { method: "GET", path: "/api/sources?limit=1" },
  { method: "GET", path: "/api/vehicle-makes?limit=1" },
];

/** API: dispatcher must get 403. */
const OPS_API_DENY = [
  { method: "GET", path: "/api/dashboard/earnings" },
  { method: "GET", path: "/api/dashboard/technician-performance" },
  { method: "GET", path: "/api/performance" },
  { method: "GET", path: "/api/admins?limit=1" },
  { method: "GET", path: "/api/partners?limit=1" },
  { method: "GET", path: "/api/businesses?limit=1" },
  { method: "GET", path: "/api/jobs/heatmap" },
  { method: "DELETE", path: "/api/customers/000000000000000000000000" },
  { method: "DELETE", path: "/api/vehicles/000000000000000000000000" },
  { method: "POST", path: "/api/sources", body: { mainSourceName: "QA Deny" } },
  { method: "DELETE", path: "/api/jobs/000000000000000000000000" },
  { method: "POST", path: "/api/jobs/import" },
  { method: "GET", path: "/api/technicians/000000000000000000000000/settlements" },
];

let passed = 0;
let failed = 0;
const results = [];

function step(id, ok, detail = "") {
  const mark = ok ? "PASS" : "FAIL";
  console.log(`${mark}  ${id}${detail ? ` — ${detail}` : ""}`);
  results.push({ id, ok, detail });
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

function runStaticUiMatrixTests() {
  console.log("\n=== Static UI path matrix ===\n");

  for (const role of ["Admin", "Super Admin"]) {
    for (const p of NAV_PATHS) {
      step(`UI ${role} can ${p}`, canAccessPath(role, p));
    }
  }

  for (const p of DISPATCHER_EXPECT_ALLOW) {
    step(`UI Job Dispatcher allow ${p}`, canAccessPath("Job Dispatcher", p));
  }

  for (const p of DISPATCHER_EXPECT_DENY) {
    step(
      `UI Job Dispatcher deny ${p}`,
      !canAccessPath("Job Dispatcher", p),
      canAccessPath("Job Dispatcher", p) ? "unexpected allow" : "blocked"
    );
  }

  step("UI unknown role denied /jobs", !canAccessPath("Guest", "/jobs"));
  step("UI null role denied /dashboard", !canAccessPath(null, "/dashboard"));

  const allNav = NAV_PATHS.map((to) => ({ to }));
  const dispatcherNav = allNav.filter((item) => canAccessPath("Job Dispatcher", item.to));
  step(
    "UI dispatcher sidebar count",
    dispatcherNav.length === 9,
    `expected 9 visible (clients is URL-only), got ${dispatcherNav.length}: ${dispatcherNav.map((n) => n.to).join(", ")}`
  );
}

function runMiddlewareUnitTests() {
  console.log("\n=== RBAC middleware sets ===\n");

  step("FULL_ACCESS has Admin", FULL_ACCESS.has("Admin"));
  step("FULL_ACCESS has Super Admin", FULL_ACCESS.has("Super Admin"));
  step("FULL_ACCESS excludes Job Dispatcher", !FULL_ACCESS.has("Job Dispatcher"));
  step("OPS_ACCESS includes Job Dispatcher", OPS_ACCESS.has("Job Dispatcher"));
  step("OPS_ACCESS includes Coordinator", OPS_ACCESS.has("Coordinator"));

  const mockRes = () => {
    const res = { statusCode: 200, body: null };
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = (body) => {
      res.body = body;
      return res;
    };
    return res;
  };

  const runMw = (mw, role) =>
    new Promise((resolve) => {
      const req = { user: { role } };
      const res = mockRes();
      mw(req, res, () => resolve({ ok: true, status: 200 }));
      setTimeout(() => resolve({ ok: false, status: res.statusCode, body: res.body }), 0);
    });

  return (async () => {
    let r = await runMw(requireOps, "Job Dispatcher");
    step("requireOps allows Job Dispatcher", r.ok);

    r = await runMw(requireOps, "Unknown");
    step("requireOps blocks unknown role", !r.ok && r.status === 403);

    r = await runMw(requireFullAdmin, "Job Dispatcher");
    step("requireFullAdmin blocks Job Dispatcher", !r.ok && r.status === 403);

    r = await runMw(requireFullAdmin, "Admin");
    step("requireFullAdmin allows Admin", r.ok);
  })();
}

function scanRouteFiles() {
  console.log("\n=== Route file RBAC scan ===\n");

  const routesDir = path.join(__dirname, "../clicks-admin-api/src/routes");
  const skipFiles = new Set(["auth.js", "accountDeletion.js", "businessPortal.js", "partnerPortal.js"]);
  const gaps = [];

  for (const file of fs.readdirSync(routesDir)) {
    if (!file.endsWith(".js") || skipFiles.has(file)) continue;
    const content = fs.readFileSync(path.join(routesDir, file), "utf8");
    if (!content.includes("authenticateToken")) continue;

    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.includes("authenticateToken")) continue;
      if (line.includes("requireOps") || line.includes("requireFullAdmin")) continue;
      if (line.includes("// public") || line.includes("getActive")) continue;

      const block = lines.slice(i, Math.min(i + 8, lines.length)).join("\n");
      if (block.includes("requireOps") || block.includes("requireFullAdmin")) continue;

      gaps.push(`${file}:${i + 1} ${line.trim()}`);
    }
  }

  step(
    "Route scan: auth-only handlers",
    gaps.length === 0,
    gaps.length ? gaps.slice(0, 5).join(" | ") : "none"
  );
}

async function ensureDispatcherAccount() {
  let admin = await Admin.findOne({ email: DISPATCHER_EMAIL });
  if (!admin) {
    admin = await Admin.create({
      firstName: "QA",
      lastName: "JobDispatcher",
      role: "Job Dispatcher",
      email: DISPATCHER_EMAIL,
      phone: "+97455550200",
      password: bcrypt.hashSync(DISPATCHER_PASSWORD, 10),
      isActive: true,
    });
  } else if (admin.role !== "Job Dispatcher") {
    admin.role = "Job Dispatcher";
    await admin.save();
  }

  const loginR = await json("POST", `${ADMIN_URL}/api/auth/login`, {
    body: { email: DISPATCHER_EMAIL, password: DISPATCHER_PASSWORD },
  });
  const token = loginR.data?.accessToken;
  if (loginR.status !== 200 || !token) {
    throw new Error(`Dispatcher login failed (${loginR.status})`);
  }
  if (loginR.data?.user?.role !== "Job Dispatcher") {
    throw new Error(`Dispatcher JWT role mismatch: ${loginR.data?.user?.role}`);
  }
  return token;
}

async function loginAdmin() {
  const r = await json("POST", `${ADMIN_URL}/api/auth/login`, {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  const token = r.data?.accessToken;
  if (r.status !== 200 || !token) {
    throw new Error(`Admin login failed (${r.status})`);
  }
  return token;
}

async function runLiveApiTests() {
  console.log("\n=== Live API RBAC ===\n");

  const health = await json("GET", `${ADMIN_URL}/api/health`);
  if (health.status !== 200) {
    step("Admin API reachable", false, `status ${health.status}`);
    return;
  }
  step("Admin API reachable", true);

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    step("MONGODB_URI for live tests", false, "missing");
    return;
  }

  await mongoose.connect(uri);

  let adminToken;
  let dispatcherToken;
  try {
    adminToken = await loginAdmin();
    step("Live admin login", true);
    dispatcherToken = await ensureDispatcherAccount();
    step("Live Job Dispatcher login", true, DISPATCHER_EMAIL);
  } catch (e) {
    step("Live auth setup", false, e.message);
    return;
  }

  for (const { method, path: apiPath } of OPS_API_ALLOW) {
    const r = await json(method, `${ADMIN_URL}${apiPath}`, { token: dispatcherToken });
    const ok = r.status >= 200 && r.status < 300;
    step(`API dispatcher allow ${method} ${apiPath}`, ok, `status ${r.status}`);
  }

  for (const { method, path: apiPath, body } of OPS_API_DENY) {
    const r = await json(method, `${ADMIN_URL}${apiPath}`, { token: dispatcherToken, body });
    step(
      `API dispatcher deny ${method} ${apiPath}`,
      r.status === 403,
      `expected 403, got ${r.status}`
    );
  }

  const adminPartners = await json("GET", `${ADMIN_URL}/api/partners?limit=1`, { token: adminToken });
  step(
    "API full admin allow GET /api/partners",
    adminPartners.status >= 200 && adminPartners.status < 300,
    `status ${adminPartners.status}`
  );

  const adminEarnings = await json("GET", `${ADMIN_URL}/api/dashboard/earnings`, { token: adminToken });
  step(
    "API full admin allow GET /api/dashboard/earnings",
    adminEarnings.status >= 200 && adminEarnings.status < 300,
    `status ${adminEarnings.status}`
  );
}

async function main() {
  console.log(`Job Dispatcher RBAC QA`);
  console.log(`ADMIN_URL=${ADMIN_URL}\n`);

  runStaticUiMatrixTests();
  await runMiddlewareUnitTests();
  scanRouteFiles();
  await runLiveApiTests();

  console.log(`\n=== Summary ===`);
  console.log(`PASS ${passed}  FAIL ${failed}`);

  const outPath = path.join(__dirname, "qa-dispatcher-rbac-results.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify({ passed, failed, results, at: new Date().toISOString() }, null, 2)
  );
  console.log(`Results written to ${outPath}`);

  if (mongoose.connection.readyState === 1) {
    await mongoose.disconnect();
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
