#!/usr/bin/env node
/**
 * QA: technician activity log (admin "Technician Logs" tab).
 *
 * Part 1 — static wiring: model, event catalog, writers, admin route, web page.
 * Part 2 — live: perform real technician actions (failed login, login, online,
 *          logout) and prove each one lands in the admin feed with the right
 *          event, and that ops roles cannot read the trail.
 *
 * Usage:
 *   node scripts/qa-tech-activity-logs.js
 *   SKIP_API=1 node scripts/qa-tech-activity-logs.js   # static only
 *
 * Env: TECH_URL, ADMIN_URL, TECH_PHONE, TECH_PASSWORD, ADMIN_EMAIL,
 *      ADMIN_PASSWORD, DISPATCHER_EMAIL, DISPATCHER_PASSWORD (optional)
 */
const fs = require("fs");
const path = require("path");

const TECH_URL = (process.env.TECH_URL || "https://clicks-tech-api-production.up.railway.app").replace(/\/$/, "");
const ADMIN_URL = (process.env.ADMIN_URL || "https://clicks-admin-api-production.up.railway.app").replace(/\/$/, "");
const TECH_PHONE = process.env.TECH_PHONE || "+97411111111";
const TECH_PASSWORD = process.env.TECH_PASSWORD || "Tech123!";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@clicks.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin123!";
const DISPATCHER_EMAIL = process.env.DISPATCHER_EMAIL || "";
const DISPATCHER_PASSWORD = process.env.DISPATCHER_PASSWORD || "";
const SKIP_API = process.env.SKIP_API === "1";

let passed = 0;
let failed = 0;
let warned = 0;

function step(id, name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  [${id}] ${name}${detail ? ` — ${detail}` : ""}`);
  ok ? passed++ : failed++;
  return ok;
}
function warn(id, name, detail = "") {
  console.log(`WARN  [${id}] ${name}${detail ? ` — ${detail}` : ""}`);
  warned++;
}

const readApi = (rel) => {
  const full = path.join(__dirname, "..", rel);
  return fs.existsSync(full) ? fs.readFileSync(full, "utf8") : "";
};
const readWeb = (rel) => {
  const full = path.join(__dirname, "../../clicks-interface/src", rel);
  return fs.existsSync(full) ? fs.readFileSync(full, "utf8") : "";
};

function runStatic() {
  console.log("\n--- Static wiring ---");

  const model = readApi("clicks-shared/models/TechnicianActivityLog.js");
  const events = readApi("clicks-shared/constants/technicianActivityEvents.js");
  const service = readApi("clicks-shared/services/technicianActivityLog.js");
  const techCtl = readApi("clicks-customer-tech-api/src/controllers/technicianController.js");
  const jobCtl = readApi("clicks-customer-tech-api/src/controllers/jobController.js");
  const socket = readApi("clicks-customer-tech-api/src/services/sosSocketService.js");
  const adminCtl = readApi("clicks-admin-api/src/controllers/technicianActivityController.js");
  const adminRoute = readApi("clicks-admin-api/src/routes/technicianActivity.js");
  const adminApp = readApi("clicks-admin-api/src/createApp.js");
  const page = readWeb("pages/TechnicianLogs/TechnicianLogs.jsx");
  const api = readWeb("store/technicianActivityApi.js");
  const sidebar = readWeb("components/AdminSidebar.jsx");
  const routes = readWeb("App.jsx");
  const rbacWeb = readWeb("utils/adminRoles.js");

  step(
    "L-S1",
    "Model exists with technician/identifier/event fields and TTL",
    model.includes("technician_id") &&
      model.includes("identifier") &&
      model.includes("expireAfterSeconds") &&
      model.includes("TECHNICIAN_ACTIVITY_LOG_TTL_DAYS")
  );
  step(
    "L-S2",
    "Event catalog covers auth, session, job and device categories",
    events.includes("auth.login.failed") &&
      events.includes("auth.login.success") &&
      events.includes("auth.logout") &&
      events.includes("session.online") &&
      events.includes("job.completed") &&
      events.includes("device.push_token_registered")
  );
  step(
    "L-S3",
    "Writer never throws, strips credentials and throttles location",
    service.includes("recordTechnicianActivity") &&
      service.includes("CREDENTIAL_KEYS") &&
      service.includes("LOCATION_MIN_INTERVAL_MS") &&
      service.includes("flushTechnicianActivity")
  );
  step(
    "L-S4",
    "Login records success, wrong password, unknown account and deactivated",
    techCtl.includes('event: "auth.login.success"') &&
      /reason: "wrong_password"/.test(techCtl) &&
      /reason: "unknown_account"/.test(techCtl) &&
      techCtl.includes('event: "account.blocked"')
  );
  step(
    "L-S5",
    "Availability + logout + device events are recorded",
    techCtl.includes('event: "session.offline_blocked"') &&
      techCtl.includes('event: "auth.logout"') &&
      techCtl.includes('event: "device.push_token_registered"') &&
      /session\.online.*:.*session\.offline/s.test(techCtl)
  );
  // accept/reject live on /api/technicians/jobs/:id/* (technicianController);
  // the rest of the lifecycle is on /api/jobs/:id/* (jobController).
  const lifecycleSource = `${jobCtl}\n${techCtl}`;
  const lifecycleEvents = [
    "job.created",
    "job.accepted",
    "job.rejected",
    "job.en_route",
    "job.arrived",
    "job.started",
    "job.start_blocked",
    "job.payment_collected",
    "job.signature_captured",
    "job.completed",
    "job.complete_blocked",
    "job.hold_requested",
    "job.cancelled",
  ];
  const missingLifecycle = lifecycleEvents.filter(
    (e) => !lifecycleSource.includes(`"${e}"`)
  );
  step(
    "L-S6",
    "Job lifecycle is recorded end to end, including blocked attempts",
    missingLifecycle.length === 0,
    missingLifecycle.length
      ? `missing: ${missingLifecycle.join(", ")}`
      : `${lifecycleEvents.length} events`
  );
  step(
    "L-S7",
    "Socket presence records app open/close and location",
    socket.includes('event: "session.app_opened"') &&
      socket.includes('event: "session.app_closed"') &&
      socket.includes('event: "location.updated"')
  );
  step(
    "L-S8",
    "Admin API exposes list, filters, summary and CSV export (full admin only)",
    adminCtl.includes("listTechnicianActivity") &&
      adminCtl.includes("getTechnicianActivityFilters") &&
      adminCtl.includes("exportTechnicianActivity") &&
      adminRoute.includes("requireFullAdmin") &&
      adminApp.includes('app.use("/api/technician-activity"')
  );
  step(
    "L-S9",
    "Admin web has the Logs page, sidebar entry, route and RBAC guard",
    page.includes("Technician Logs") &&
      api.includes("/technician-activity") &&
      sidebar.includes('to: "/technician-logs"') &&
      routes.includes('path="/technician-logs"') &&
      rbacWeb.includes('"/technician-logs"')
  );
  step(
    "L-S10",
    "Technician app sends platform + version headers for the Device column",
    (() => {
      const dio = fs.existsSync(
        path.join(__dirname, "../../clicks-technician/lib/core/api/dio_helper.dart")
      )
        ? fs.readFileSync(
            path.join(__dirname, "../../clicks-technician/lib/core/api/dio_helper.dart"),
            "utf8"
          )
        : "";
      return dio.includes("x-app-version") && dio.includes("x-app-platform");
    })()
  );
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
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 200) };
  }
  return { status: res.status, data, text };
}

/** Newest matching row for this technician, or null. */
function findRow(logs, event, sinceMs) {
  return (
    logs.find(
      (row) =>
        row.event === event && new Date(row.at).getTime() >= sinceMs - 2000
    ) || null
  );
}

async function runLive() {
  console.log("\n--- Live trail on the API ---");
  console.log(`Tech API:  ${TECH_URL}`);
  console.log(`Admin API: ${ADMIN_URL}`);

  const adminLogin = await json("POST", `${ADMIN_URL}/api/auth/login`, {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  const adminToken = adminLogin.data?.accessToken || adminLogin.data?.token;
  if (!step("L-1", "Admin login", !!adminToken, `${adminLogin.status}`)) return;

  const probe = await json("GET", `${ADMIN_URL}/api/technician-activity?limit=1`, {
    token: adminToken,
  });
  if (
    !step(
      "L-2",
      "GET /api/technician-activity is deployed",
      probe.status === 200,
      probe.status === 404
        ? "404 — admin API not redeployed with the activity log yet"
        : `${probe.status}`
    )
  ) {
    return;
  }

  const startedAt = Date.now();

  // 1. A wrong password must be recorded.
  const bad = await json("POST", `${TECH_URL}/api/technicians/login`, {
    body: { phone: TECH_PHONE, password: `wrong-${Date.now()}` },
  });
  step("L-3", "Wrong password rejected", bad.status === 401, `${bad.status}`);

  // 2. An unknown number must be recorded with what was typed.
  const unknownPhone = `+9749${String(Date.now()).slice(-7)}`;
  await json("POST", `${TECH_URL}/api/technicians/login`, {
    body: { phone: unknownPhone, password: "whatever" },
  });

  // 3. A real login, an availability change and a logout.
  const good = await json("POST", `${TECH_URL}/api/technicians/login`, {
    body: { phone: TECH_PHONE, password: TECH_PASSWORD },
  });
  const techToken = good.data?.token;
  const techId = String(good.data?.technician?.id || good.data?.technician?._id || "");
  step("L-4", "Technician login", !!techToken, `${good.status}`);
  if (!techToken) return;

  await json("PATCH", `${TECH_URL}/api/technicians/status`, {
    token: techToken,
    body: { status: "Online" },
  });
  await json("DELETE", `${TECH_URL}/api/technicians/fcm-token`, { token: techToken });

  // Give the fire-and-forget writes a moment to land.
  await new Promise((resolve) => setTimeout(resolve, 1500));

  const feed = await json(
    "GET",
    `${ADMIN_URL}/api/technician-activity?limit=50&technician_id=${techId}`,
    { token: adminToken }
  );
  const logs = feed.data?.logs || [];
  step("L-5", "Feed returns rows for this technician", feed.status === 200 && logs.length > 0, `rows=${logs.length}`);

  const failedRow = findRow(logs, "auth.login.failed", startedAt);
  step(
    "L-6",
    "Wrong password recorded (no password stored)",
    !!failedRow && failedRow.outcome === "failure" && !JSON.stringify(failedRow).includes("wrong-"),
    failedRow ? `${failedRow.message}` : "missing"
  );

  const successRow = findRow(logs, "auth.login.success", startedAt);
  step("L-7", "Successful login recorded", !!successRow, successRow?.message || "missing");

  const onlineRow = findRow(logs, "session.online", startedAt);
  step("L-8", "Going online recorded", !!onlineRow, onlineRow?.message || "missing");

  const logoutRow = findRow(logs, "auth.logout", startedAt);
  step("L-9", "Logout recorded", !!logoutRow, logoutRow?.message || "missing");

  if (successRow) {
    step(
      "L-10",
      "Rows carry device context (platform / version / ip)",
      Boolean(successRow.ip || successRow.platform || successRow.app_version),
      `ip=${successRow.ip || "—"} platform=${successRow.platform || "—"} version=${successRow.app_version || "—"}`
    );
  }

  // 4. The unknown-number attempt is findable by what was typed.
  const search = await json(
    "GET",
    `${ADMIN_URL}/api/technician-activity?search=${encodeURIComponent(unknownPhone.slice(-8))}`,
    { token: adminToken }
  );
  const unknownRow = (search.data?.logs || []).find(
    (row) => row.identifier === unknownPhone
  );
  step(
    "L-11",
    "Attempt on an unknown number is searchable by the typed value",
    !!unknownRow && unknownRow.technician_id === null,
    unknownRow ? unknownRow.message : "missing"
  );

  // 5. Filters, summary and export.
  const filters = await json("GET", `${ADMIN_URL}/api/technician-activity/filters`, {
    token: adminToken,
  });
  step(
    "L-12",
    "Filter catalog available for the dropdowns",
    filters.status === 200 && (filters.data?.events || []).length > 10,
    `events=${filters.data?.events?.length ?? 0}`
  );

  const summary = await json(
    "GET",
    `${ADMIN_URL}/api/technician-activity/summary?days=7&technician_id=${techId}`,
    { token: adminToken }
  );
  step(
    "L-13",
    "Summary counts recent events + failed logins",
    summary.status === 200 && summary.data?.total > 0,
    `total=${summary.data?.total} failed_logins=${summary.data?.failed_logins}`
  );

  const csv = await json(
    "GET",
    `${ADMIN_URL}/api/technician-activity/export?event=auth.login.failed&limit=10`,
    { token: adminToken }
  );
  step(
    "L-14",
    "CSV export returns a header row",
    csv.status === 200 && /^at,technician,phone,event/.test(csv.text || ""),
    `${csv.status}`
  );

  // 6. RBAC: ops roles must not read the trail.
  const anon = await json("GET", `${ADMIN_URL}/api/technician-activity`);
  step("L-15", "Unauthenticated read rejected", anon.status === 401, `${anon.status}`);

  if (DISPATCHER_EMAIL && DISPATCHER_PASSWORD) {
    const dispatcherLogin = await json("POST", `${ADMIN_URL}/api/auth/login`, {
      body: { email: DISPATCHER_EMAIL, password: DISPATCHER_PASSWORD },
    });
    const dispatcherToken =
      dispatcherLogin.data?.accessToken || dispatcherLogin.data?.token;
    if (dispatcherToken) {
      const denied = await json("GET", `${ADMIN_URL}/api/technician-activity`, {
        token: dispatcherToken,
      });
      step("L-16", "Job Dispatcher is refused (403)", denied.status === 403, `${denied.status}`);
    } else {
      warn("L-16", "Dispatcher RBAC check skipped", "dispatcher login failed");
    }
  } else {
    warn("L-16", "Dispatcher RBAC check skipped", "set DISPATCHER_EMAIL / DISPATCHER_PASSWORD");
  }
}

async function main() {
  console.log("=== Technician Activity Log QA ===");
  runStatic();

  if (SKIP_API) {
    console.log("\n(SKIP_API=1 — live checks not run)");
  } else {
    try {
      await runLive();
    } catch (err) {
      step("L-live", "Live checks aborted", false, err.message);
    }
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed, ${warned} warnings ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("QA aborted:", err.message);
  process.exit(1);
});
