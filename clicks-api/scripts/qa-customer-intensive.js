#!/usr/bin/env node
/**
 * Customer journey QA against a running local (or override) stack.
 *
 * Covers: login, session, vehicles, coverage reject, live/unpaid booking
 * guards, service-request create, cancel-customer, launch flags.
 *
 * Usage:
 *   node scripts/qa-customer-intensive.js
 *
 * Env:
 *   TECH_URL     default http://localhost:5001
 *   ADMIN_URL    default http://localhost:5000
 *   CUSTOMER_EMAIL / CUSTOMER_PASSWORD / CUSTOMER_PHONE
 */
const TECH_URL = (process.env.TECH_URL || "http://localhost:5001").replace(/\/$/, "");
const ADMIN_URL = (process.env.ADMIN_URL || "http://localhost:5000").replace(/\/$/, "");
const CUSTOMER_EMAIL = process.env.CUSTOMER_EMAIL || "customer@clicks.local";
const CUSTOMER_PASSWORD = process.env.CUSTOMER_PASSWORD || "Customer123!";
const CUSTOMER_PHONE = process.env.CUSTOMER_PHONE || "+97433333333";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@clicks.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin123!";

const DOHA_LAT = 25.2854;
const DOHA_LNG = 51.531;

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

async function json(method, url, { token, body } = {}) {
  const headers = { Accept: "application/json" };
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

async function loginCustomer() {
  const byEmail = await json("POST", `${TECH_URL}/api/customers/login`, {
    body: { email: CUSTOMER_EMAIL, password: CUSTOMER_PASSWORD },
  });
  if (byEmail.status === 200 && byEmail.data?.token) return byEmail.data.token;
  const byPhone = await json("POST", `${TECH_URL}/api/customers/login`, {
    body: { phone_number: CUSTOMER_PHONE, password: CUSTOMER_PASSWORD },
  });
  if (byPhone.status !== 200 || !byPhone.data?.token) {
    throw new Error(
      `Customer login failed (${byPhone.status}): ${JSON.stringify(byPhone.data).slice(0, 180)}`
    );
  }
  return byPhone.data.token;
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

async function main() {
  console.log(`Customer intensive QA → ${TECH_URL}`);

  const flags = await json("GET", `${TECH_URL}/api/launch-flags`);
  step(
    "launch flags",
    flags.status === 200 && typeof flags.data?.publicSos === "boolean",
    JSON.stringify({
      publicSos: flags.data?.publicSos,
      membership: flags.data?.customerMembership,
      skipcash: flags.data?.skipcash,
    })
  );

  let token;
  try {
    token = await loginCustomer();
    step("customer login", true);
  } catch (err) {
    step("customer login", false, err.message);
    console.log(`\n${failed} failed — cannot continue without a customer token`);
    process.exit(1);
  }

  const profile = await json("GET", `${TECH_URL}/api/customers/profile`, { token });
  step("profile", profile.status === 200, profile.data?.email || profile.data?.phone_number);

  const session = await json("GET", `${TECH_URL}/api/jobs/customer/session`, { token });
  step(
    "enriched session",
    session.status === 200 &&
      Object.prototype.hasOwnProperty.call(session.data || {}, "can_book_sos") &&
      Object.prototype.hasOwnProperty.call(session.data || {}, "session_kind"),
    `kind=${session.data?.session_kind} can_book=${session.data?.can_book_sos}`
  );

  const vehicles = await json("GET", `${TECH_URL}/api/vehicles`, { token });
  step("vehicles list", vehicles.status === 200);

  const outside = await json("POST", `${TECH_URL}/api/service-requests`, {
    token,
    body: {
      service_type: "Battery Change",
      timing: "immediate",
      latitude: 40.7,
      longitude: -74,
      skip_vehicle: true,
    },
  });
  step(
    "coverage reject NYC pin",
    outside.status === 400 && outside.data?.code === "OUTSIDE_COVERAGE",
    `${outside.status} ${outside.data?.code || ""}`
  );

  const booking = await json("POST", `${TECH_URL}/api/service-requests`, {
    token,
    body: {
      service_type: "Battery Change",
      timing: "immediate",
      latitude: DOHA_LAT,
      longitude: DOHA_LNG,
      skip_vehicle: true,
    },
  });
  if (booking.status === 201) {
    step("immediate service request", true, booking.data?.service_request?.id);
    const srId = booking.data?.service_request?.id;
    if (srId) {
      const cancelSr = await json("POST", `${TECH_URL}/api/service-requests/${srId}/cancel`, {
        token,
        body: { reason: "qa_cleanup" },
      });
      step("cancel pending service request", cancelSr.status === 200);
    }
  } else if (booking.status === 409) {
    step(
      "immediate service request blocked by guard",
      ["LIVE_JOB_ACTIVE", "UNPAID_JOB_HOLD", "SERVICE_REQUEST_ALREADY_ACTIVE"].includes(
        booking.data?.code
      ),
      booking.data?.code
    );
  } else {
    step("immediate service request", false, `${booking.status} ${booking.data?.code || ""}`);
  }

  try {
    const adminToken = await loginAdmin();
    step("admin login (for cancel-customer fixture)", true);
    const jobs = await json("GET", `${ADMIN_URL}/api/jobs?limit=5`, { token: adminToken });
    const first = (jobs.data?.jobs || [])[0];
    if (first?._id) {
      const cancel = await json("POST", `${TECH_URL}/api/jobs/${first._id}/cancel-customer`, {
        token,
        body: { reason: "changed_mind" },
      });
      if (cancel.status === 200) {
        step("cancel-customer on assigned-like job", cancel.data?.cancel_fee_due === false || cancel.data?.cancel_fee_due === true);
      } else if (cancel.status === 400 && cancel.data?.code === "JOB_NOT_CANCELLABLE") {
        step("cancel-customer blocked in_progress/later", true, cancel.data.code);
      } else if (cancel.status === 403) {
        warn("cancel-customer", "seed job is not owned by QA customer");
      } else {
        step("cancel-customer", false, `${cancel.status} ${cancel.data?.code || ""}`);
      }
    } else {
      warn("cancel-customer", "no admin jobs to probe");
    }
  } catch (err) {
    warn("admin login / cancel-customer", err.message);
  }

  const history = await json("GET", `${TECH_URL}/api/jobs/customer/history?page=1&limit=5`, {
    token,
  });
  step("job history", history.status === 200);

  const plans = await json("GET", `${TECH_URL}/api/membership/plans`, { token });
  step(
    "membership plans (flag-aware)",
    plans.status === 200,
    `count=${Array.isArray(plans.data?.plans) ? plans.data.plans.length : "n/a"}`
  );

  console.log(`\n${passed} passed, ${failed} failed, ${warned} warnings`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
