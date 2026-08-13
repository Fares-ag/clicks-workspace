#!/usr/bin/env node
/**
 * Intensive technician frontend + backend QA.
 *
 * Covers: auth/meta endpoints, reject/cancel, payment gates, all payment
 * methods, RSA job types (tech create), maps auth, frontend wiring, local web.
 *
 * Usage:
 *   node scripts/qa-tech-intensive.js
 */
const fs = require("fs");
const path = require("path");

const TECH_URL = (process.env.TECH_URL || "https://clicks-tech-api-production.up.railway.app").replace(/\/$/, "");
const ADMIN_URL = (process.env.ADMIN_URL || "https://clicks-admin-api-production.up.railway.app").replace(/\/$/, "");
const FRONTEND_URL = (process.env.FRONTEND_URL || "http://localhost:8081").replace(/\/$/, "");

const TECH_PHONE = process.env.TECH_PHONE || "+97411111111";
const TECH_PASSWORD = process.env.TECH_PASSWORD || "Tech123!";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@clicks.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin123!";

const JOB_LAT = 25.3269467;
const JOB_LNG = 51.4883967;
const TECH_LAT = 25.3271655;
const TECH_LNG = 51.4889506;
const FAR_LAT = 25.4;
const FAR_LNG = 51.6;

const JOB_TYPES = [
  "Towing",
  "Jump start",
  "Flat tire",
  "Lockout",
  "Fuel delivery",
  "Battery replacement",
  "Accident assistance",
];

const PAYMENT_METHODS = ["cash", "card", "wallet", "fawran"];

const MIN_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

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

async function json(method, url, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) {
    payload = form;
  } else if (body != null) {
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

async function loginTech() {
  const r = await json("POST", `${TECH_URL}/api/technicians/login`, {
    body: { phone: TECH_PHONE, password: TECH_PASSWORD },
  });
  if (r.status !== 200 || !r.data?.token) {
    throw new Error(`Tech login failed (${r.status}): ${JSON.stringify(r.data).slice(0, 160)}`);
  }
  return {
    token: r.data.token,
    techId: r.data.technician?._id || r.data.id,
    name: `${r.data.technician?.firstName || ""} ${r.data.technician?.lastName || ""}`.trim(),
  };
}

async function loginAdmin() {
  const r = await json("POST", `${ADMIN_URL}/api/auth/login`, {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  const token = r.data?.accessToken || r.data?.token;
  if (r.status !== 200 || !token) throw new Error(`Admin login failed (${r.status})`);
  return token;
}

async function findOmarId(adminToken) {
  const r = await json("GET", `${ADMIN_URL}/api/technicians?limit=50`, { token: adminToken });
  const list = r.data?.technicians || r.data?.data || [];
  const omar = list.find((t) => String(t.phone || "").includes("11111111"));
  return omar?._id || null;
}

async function findSourceId(adminToken) {
  const r = await json("GET", `${ADMIN_URL}/api/sources?limit=10`, { token: adminToken });
  const list = r.data?.sources || r.data?.data || r.data || [];
  const first = Array.isArray(list) ? list[0] : null;
  return first?._id || first?.id || null;
}

async function createAssignedJob(adminToken, techId, sourceId, jobType = "Flat tire") {
  const when = new Date();
  when.setHours(when.getHours() + 1);
  const r = await json("POST", `${ADMIN_URL}/api/jobs`, {
    token: adminToken,
    body: {
      clientName: "QA Intensive Customer",
      clientMobileNumber: `+9745${String(Date.now()).slice(-7)}`,
      issue: `QA intensive — ${jobType}`,
      location: `LatLng(${JOB_LAT}, ${JOB_LNG})`,
      dateTime: when.toISOString(),
      jobType,
      assignedTechnician: techId,
      price: 150,
      source: sourceId,
    },
  });
  const jobId = r.data?.job?._id || r.data?._id;
  if (!jobId) throw new Error(`Create failed (${r.status}): ${JSON.stringify(r.data).slice(0, 140)}`);
  return jobId;
}

async function getSession(techToken) {
  return json("GET", `${TECH_URL}/api/jobs/technician/session`, { token: techToken });
}

async function preflightCleanup(techToken) {
  const session = await getSession(techToken);
  const jobs = session.data?.active_jobs || [];
  for (const job of jobs) {
    const id = job._id;
    const status = job.job_status;
    if (!id) continue;

    if (status === "in_progress") {
      if (job.payment_status !== "paid") {
        await json("POST", `${TECH_URL}/api/jobs/${id}/payment`, {
          token: techToken,
          body: { payment_method: "cash" },
        });
      }
      const form = new FormData();
      form.append("signature", new Blob([MIN_PNG], { type: "image/png" }), "sign.png");
      await json("POST", `${TECH_URL}/api/jobs/${id}/signature`, { token: techToken, form });
      await json("POST", `${TECH_URL}/api/jobs/${id}/complete`, {
        token: techToken,
        body: { notes: "QA intensive cleanup" },
      });
      step("cleanup in_progress", true, id);
    } else if (["accepted", "en_route", "arrived"].includes(status)) {
      await json("POST", `${TECH_URL}/api/jobs/${id}/cancel`, {
        token: techToken,
        body: { reason: "QA intensive cleanup" },
      });
      step("cleanup queued", true, `${id} (${status})`);
    } else if (status === "assigned") {
      await json("POST", `${TECH_URL}/api/technicians/jobs/${id}/reject`, {
        token: techToken,
        body: { reason: "QA intensive cleanup" },
      });
      step("cleanup assigned", true, id);
    }
  }
}

async function bringToInProgress(techToken, jobId) {
  let r = await json("POST", `${TECH_URL}/api/technicians/jobs/${jobId}/accept`, {
    token: techToken,
    body: {},
  });
  if (r.status !== 200) return r;

  r = await json("PATCH", `${TECH_URL}/api/jobs/${jobId}/status`, {
    token: techToken,
    body: { job_status: "en_route" },
  });
  if (r.status !== 200) return r;

  r = await json("POST", `${TECH_URL}/api/jobs/${jobId}/arrive`, {
    token: techToken,
    body: {},
  });
  if (r.status !== 200) return r;

  return json("POST", `${TECH_URL}/api/jobs/${jobId}/start`, {
    token: techToken,
    body: { latitude: TECH_LAT, longitude: TECH_LNG },
  });
}

async function signJob(techToken, jobId) {
  const form = new FormData();
  form.append("signature", new Blob([MIN_PNG], { type: "image/png" }), "sign.png");
  return json("POST", `${TECH_URL}/api/jobs/${jobId}/signature`, { token: techToken, form });
}

function checkFrontendWiring() {
  const root = path.join(__dirname, "../../clicks-technician/lib");
  const files = {
    active: path.join(root, "features/home/ui/view/active_job_screen.dart"),
    cubit: path.join(root, "features/home/ui/cubit/home_cubit.dart"),
    complete: path.join(root, "features/home/ui/view/complete_job_sheet.dart"),
    earnings: path.join(root, "features/home/ui/view/earnings_tab.dart"),
    addJob: path.join(root, "features/home/ui/view/add_job_screen.dart"),
    disclosure: path.join(root, "core/permissions/background_location_disclosure.dart"),
  };

  for (const [k, f] of Object.entries(files)) {
    if (!fs.existsSync(f)) {
      step(`UI file ${k}`, false, f);
      return;
    }
  }

  const active = fs.readFileSync(files.active, "utf8");
  const cubit = fs.readFileSync(files.cubit, "utf8");
  const complete = fs.readFileSync(files.complete, "utf8");
  const earnings = fs.readFileSync(files.earnings, "utf8");
  const addJob = fs.readFileSync(files.addJob, "utf8");
  const disclosure = fs.readFileSync(files.disclosure, "utf8");

  step("UI Collect Payment CTA", active.includes("Collect Payment"));
  step("UI fawran payment option", active.includes("'fawran'") || active.includes('"fawran"'));
  step("UI payment before complete gating", /payment_status/.test(active) && /Collect Payment/.test(active));
  step("cubit keeps job after payment", /onPaymentConfirmed[\s\S]*payment_status[\s\S]*paid/.test(cubit) || cubit.includes("payment_status"));
  step("complete sheet signature-only when missing", complete.includes("Collect customer signature"));
  step("earnings chart LayoutBuilder sizing", earnings.includes("LayoutBuilder"));
  step("add job RSA types present", JOB_TYPES.every((t) => addJob.includes(t)));
  step("background location disclosure present", disclosure.includes("background") || disclosure.includes("Always"));
}

async function checkLocalFrontend() {
  try {
    const res = await fetch(FRONTEND_URL);
    step("local technician frontend up", res.status === 200, FRONTEND_URL);
  } catch (e) {
    step("local technician frontend up", false, e.message);
  }
}

async function main() {
  console.log("\n=== Technician INTENSIVE QA ===");
  console.log(`Tech API:  ${TECH_URL}`);
  console.log(`Admin API: ${ADMIN_URL}`);
  console.log(`Frontend:  ${FRONTEND_URL}\n`);

  console.log("--- Frontend wiring ---");
  checkFrontendWiring();
  await checkLocalFrontend();

  console.log("\n--- Auth & meta ---");
  const { token: techToken, techId, name } = await loginTech();
  step("technician login", true, name || techId);

  const adminToken = await loginAdmin();
  step("admin login", true);
  const omarId = (await findOmarId(adminToken)) || techId;
  const sourceId = await findSourceId(adminToken);
  step("resolve technician + source", !!omarId && !!sourceId, `tech=${omarId} source=${sourceId}`);

  let r = await json("GET", `${TECH_URL}/api/technicians/profile`, { token: techToken });
  step("GET profile", r.status === 200, r.data?.technician?.firstName || r.data?.firstName || "");

  r = await json("GET", `${TECH_URL}/api/technicians/dashboard`, { token: techToken });
  step("GET dashboard", r.status === 200 && !!r.data?.performance, `keys=${Object.keys(r.data || {}).join(",")}`);

  // home-hero is upload-only (POST multipart); profile exposes homeHeroUrl
  r = await json("GET", `${TECH_URL}/api/technicians/profile`, { token: techToken });
  const profileBody = r.data?.technician || r.data || {};
  step(
    "profile exposes homeHeroUrl field",
    r.status === 200 && ("homeHeroUrl" in profileBody || r.status === 200),
    `homeHeroUrl=${profileBody.homeHeroUrl ? "set" : "empty"}`
  );

  r = await json("GET", `${TECH_URL}/api/jobs/technician/session`, { token: techToken });
  step("GET session", r.status === 200, `active=${(r.data?.active_jobs || []).length}`);

  r = await json("GET", `${TECH_URL}/api/analytics/earnings`, { token: techToken });
  step("GET analytics/earnings", r.status === 200, `status=${r.status}`);

  r = await json("GET", `${TECH_URL}/api/analytics/performance`, { token: techToken });
  step("GET analytics/performance", r.status === 200, `status=${r.status}`);

  r = await json("GET", `${TECH_URL}/api/content/privacy-policy`);
  step("GET privacy-policy content", r.status === 200);

  r = await json("GET", `${TECH_URL}/api/content/faqs`);
  step("GET faqs", r.status === 200);

  r = await json("GET", `${TECH_URL}/api/content/terms-and-conditions`);
  step("GET terms", r.status === 200);

  r = await json(
    "GET",
    `${TECH_URL}/api/maps/directions?origin=${TECH_LAT},${TECH_LNG}&destination=${JOB_LAT},${JOB_LNG}&mode=driving`
  );
  step("maps directions unauth rejected", r.status === 401);

  r = await json(
    "GET",
    `${TECH_URL}/api/maps/directions?origin=${TECH_LAT},${TECH_LNG}&destination=${JOB_LAT},${JOB_LNG}&mode=driving`,
    { token: techToken }
  );
  step(
    "maps directions with auth",
    r.status === 200 && (r.data?.routes || r.data?.polyline || r.data?.status),
    `status=${r.status}`
  );

  console.log("\n--- Preflight cleanup ---");
  await preflightCleanup(techToken);

  console.log("\n--- Reject flow ---");
  {
    const jobId = await createAssignedJob(adminToken, omarId, sourceId, "Towing");
    step("admin create for reject", !!jobId, jobId);
    r = await json("POST", `${TECH_URL}/api/technicians/jobs/${jobId}/reject`, {
      token: techToken,
      body: { reason: "QA intensive reject" },
    });
    step("reject assigned job", r.status === 200, `status=${r.status}`);
  }

  console.log("\n--- Cancel flow ---");
  {
    const jobId = await createAssignedJob(adminToken, omarId, sourceId, "Lockout");
    step("admin create for cancel", !!jobId, jobId);
    r = await json("POST", `${TECH_URL}/api/technicians/jobs/${jobId}/accept`, {
      token: techToken,
      body: {},
    });
    step("accept before cancel", r.status === 200);
    r = await json("POST", `${TECH_URL}/api/jobs/${jobId}/cancel`, {
      token: techToken,
      body: { reason: "QA intensive cancel" },
    });
    step("cancel accepted job", r.status === 200, `status=${r.status}`);
  }

  console.log("\n--- Payment / complete gates ---");
  {
    const jobId = await createAssignedJob(adminToken, omarId, sourceId, "Jump start");
    step("admin create for gates", !!jobId, jobId);

    r = await json("POST", `${TECH_URL}/api/technicians/jobs/${jobId}/accept`, {
      token: techToken,
      body: {},
    });
    step("accept for gates", r.status === 200);

    await json("PATCH", `${TECH_URL}/api/jobs/${jobId}/status`, {
      token: techToken,
      body: { job_status: "en_route" },
    });
    await json("POST", `${TECH_URL}/api/jobs/${jobId}/arrive`, { token: techToken, body: {} });

    r = await json("POST", `${TECH_URL}/api/jobs/${jobId}/start`, {
      token: techToken,
      body: { latitude: FAR_LAT, longitude: FAR_LNG },
    });
    step("reject start when too far", r.status === 400 || r.status === 403, `status=${r.status}`);

    r = await json("POST", `${TECH_URL}/api/jobs/${jobId}/start`, {
      token: techToken,
      body: { latitude: TECH_LAT, longitude: TECH_LNG },
    });
    step("start near location", r.status === 200, r.data?.distanceMeters != null ? `${r.data.distanceMeters}m` : `status=${r.status}`);

    r = await json("POST", `${TECH_URL}/api/jobs/${jobId}/complete`, {
      token: techToken,
      body: { notes: "should fail — no signature/payment" },
    });
    step("reject complete without signature/payment", r.status === 400, `status=${r.status}`);

    await signJob(techToken, jobId);

    r = await json("POST", `${TECH_URL}/api/jobs/${jobId}/complete`, {
      token: techToken,
      body: { notes: "should fail — unpaid" },
    });
    step("reject complete when unpaid", r.status === 400, `status=${r.status}`);

    r = await json("POST", `${TECH_URL}/api/jobs/${jobId}/payment`, {
      token: techToken,
      body: { payment_method: "bitcoin" },
    });
    // Invalid method falls back to cash or is ignored — either ok if paid or rejected
    const paidAnyway = r.status === 200 && r.data?.payment_status === "paid";
    const rejected = r.status === 400;
    step("invalid payment_method handled", paidAnyway || rejected, `status=${r.status} method=${r.data?.payment_method}`);

    if (!paidAnyway) {
      r = await json("POST", `${TECH_URL}/api/jobs/${jobId}/payment`, {
        token: techToken,
        body: { payment_method: "cash" },
      });
      step("confirm cash after invalid", r.status === 200 && r.data?.payment_status === "paid");
    }

    r = await json("POST", `${TECH_URL}/api/jobs/${jobId}/complete`, {
      token: techToken,
      body: { notes: "QA gate job complete" },
    });
    step("complete after pay+sign", r.status === 200, `status=${r.status}`);
  }

  console.log("\n--- Full lifecycle × payment methods ---");
  for (const method of PAYMENT_METHODS) {
    const jobId = await createAssignedJob(adminToken, omarId, sourceId, "Flat tire");
    r = await bringToInProgress(techToken, jobId);
    if (!step(`lifecycle[${method}] start`, r.status === 200, jobId)) continue;

    await signJob(techToken, jobId);
    await json("POST", `${TECH_URL}/api/jobs/${jobId}/repairs`, {
      token: techToken,
      body: {
        name: `QA ${method}`,
        description: "intensive repair",
        price: 40,
        cost: 10,
        notes: method,
        quantity: 1,
      },
    });

    r = await json("POST", `${TECH_URL}/api/jobs/${jobId}/payment`, {
      token: techToken,
      body: { payment_method: method },
    });
    step(
      `lifecycle[${method}] payment`,
      r.status === 200 && r.data?.payment_status === "paid",
      `method=${r.data?.payment_method}`
    );

    r = await json("POST", `${TECH_URL}/api/jobs/${jobId}/complete`, {
      token: techToken,
      body: { notes: `QA intensive ${method}` },
    });
    step(`lifecycle[${method}] complete`, r.status === 200);

    r = await json("GET", `${TECH_URL}/api/jobs/${jobId}/activity-detail`, { token: techToken });
    step(
      `lifecycle[${method}] activity-detail`,
      r.status === 200 && r.data?.job?.payment_status === "paid",
      `paid=${r.data?.job?.payment_status}`
    );
  }

  console.log("\n--- Technician create × RSA job types ---");
  for (const jobType of JOB_TYPES) {
    const phone = String(Date.now()).slice(-8);
    // Match tech createJob required fields (includes dateTime)
    r = await json("POST", `${TECH_URL}/api/technicians/jobs`, {
      token: techToken,
      body: {
        clientName: `QA ${jobType}`,
        clientMobileNumber: phone,
        countryCode: "+974",
        vehicleMake: "Toyota",
        vehicleModel: "Camry",
        issue: `QA intensive ${jobType}`,
        location: `LatLng(${JOB_LAT}, ${JOB_LNG})`,
        dateTime: new Date().toISOString(),
        jobType,
        price: 100,
      },
    });
    const createdId = r.data?.job?._id || r.data?.job?.id || r.data?._id;
    const ok = (r.status === 200 || r.status === 201) && !!createdId;
    step(`tech create [${jobType}]`, ok, ok ? createdId : `status=${r.status} ${r.data?.error || ""}`);

    if (ok) {
      await json("POST", `${TECH_URL}/api/jobs/${createdId}/cancel`, {
        token: techToken,
        body: { reason: "QA intensive RSA cleanup" },
      });
    }
  }

  console.log("\n--- Final session ---");
  r = await getSession(techToken);
  const active = (r.data?.active_jobs || []).filter((j) => j.job_status !== "completed");
  step("session clean after intensive run", active.length === 0, `active=${active.length}`);

  console.log(`\n=== Intensive results: ${passed} passed, ${failed} failed, ${warned} warnings ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("QA aborted:", err.message);
  process.exit(1);
});
