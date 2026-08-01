#!/usr/bin/env node
/**
 * End-to-end technician job lifecycle QA (API-driven).
 *
 * Usage:
 *   node scripts/qa-tech-full-job.js
 *
 * Env:
 *   TECH_URL          default https://clicks-tech-api-production.up.railway.app
 *   ADMIN_URL         default https://clicks-admin-api-production.up.railway.app
 *   TECH_PHONE        default +97411111111
 *   TECH_PASSWORD     default Tech123!
 *   ADMIN_EMAIL       default admin@clicks.local
 *   ADMIN_PASSWORD    default Admin123!
 *   SKIP_ADMIN_CREATE set 1 to use existing assigned job only
 */
const TECH_URL = (process.env.TECH_URL || "https://clicks-tech-api-production.up.railway.app").replace(/\/$/, "");
const ADMIN_URL = (process.env.ADMIN_URL || "https://clicks-admin-api-production.up.railway.app").replace(/\/$/, "");

const TECH_PHONE = process.env.TECH_PHONE || "+97411111111";
const TECH_PASSWORD = process.env.TECH_PASSWORD || "Tech123!";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@clicks.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin123!";

/** Doha coords — job location + start GPS (within 200m) */
const JOB_LAT = 25.3269467;
const JOB_LNG = 51.4883967;
const TECH_LAT = 25.3271655;
const TECH_LNG = 51.4889506;

const MIN_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

let passed = 0;
let failed = 0;

function step(name, ok, detail = "") {
  const mark = ok ? "PASS" : "FAIL";
  console.log(`${mark}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (ok) passed++;
  else failed++;
  return ok;
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
  let data = null;
  const text = await res.text();
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
    throw new Error(`Tech login failed (${r.status}): ${r.data?.error || r.data?.message || "no token"}`);
  }
  return { token: r.data.token, techId: r.data.technician?._id || r.data.id };
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

async function findOmarId(adminToken) {
  const r = await json("GET", `${ADMIN_URL}/api/technicians?limit=50`, { token: adminToken });
  const list = r.data?.technicians || r.data?.data || [];
  const omar = list.find((t) => String(t.phone || "").includes("11111111"));
  return omar?._id || list[0]?._id;
}

async function findSourceId(adminToken) {
  const r = await json("GET", `${ADMIN_URL}/api/sources?limit=10`, { token: adminToken });
  const list = r.data?.sources || r.data?.data || r.data || [];
  const first = Array.isArray(list) ? list[0] : null;
  return first?._id || first?.id;
}

async function createAssignedJob(adminToken, techId, sourceId) {
  const now = new Date();
  now.setHours(now.getHours() + 1);
  const location = `LatLng(${JOB_LAT}, ${JOB_LNG})`;
  const r = await json("POST", `${ADMIN_URL}/api/jobs`, {
    token: adminToken,
    body: {
      clientName: "QA Test Customer",
      clientMobileNumber: "+97455555555",
      issue: "QA tire check — auto test",
      location,
      dateTime: now.toISOString(),
      jobType: "Tires",
      assignedTechnician: techId,
      price: 150,
      source: sourceId,
    },
  });
  const jobId = r.data?.job?._id || r.data?._id;
  if (r.status !== 201 && r.status !== 200) {
    throw new Error(`Create job failed (${r.status}): ${JSON.stringify(r.data).slice(0, 120)}`);
  }
  return jobId;
}

async function getSession(techToken) {
  return json("GET", `${TECH_URL}/api/jobs/technician/session`, { token: techToken });
}

/** Finish or cancel active jobs so a fresh QA run can start. */
async function preflightCleanup(techToken) {
  const session = await getSession(techToken);
  const jobs = session.data?.active_jobs || [];
  for (const job of jobs) {
    const id = job._id;
    const status = job.job_status;
    if (!id) continue;

    if (status === "in_progress") {
      const form = new FormData();
      form.append("signature", new Blob([MIN_PNG], { type: "image/png" }), "sign.png");
      await json("POST", `${TECH_URL}/api/jobs/${id}/signature`, { token: techToken, form });
      await json("POST", `${TECH_URL}/api/jobs/${id}/complete`, {
        token: techToken,
        body: { notes: "QA cleanup complete" },
      });
      await json("POST", `${TECH_URL}/api/jobs/${id}/payment`, {
        token: techToken,
        body: { payment_method: "cash" },
      });
      step("cleanup in_progress job", true, id);
    } else if (status === "completed" && job.payment_status !== "paid") {
      await json("POST", `${TECH_URL}/api/jobs/${id}/payment`, {
        token: techToken,
        body: { payment_method: "cash" },
      });
      step("cleanup unpaid completed", true, id);
    } else if (["accepted", "en_route", "arrived"].includes(status)) {
      await json("POST", `${TECH_URL}/api/jobs/${id}/cancel`, {
        token: techToken,
        body: { reason: "QA preflight cleanup" },
      });
      step("cleanup queued job", true, `${id} (${status})`);
    } else if (status === "assigned") {
      await json("POST", `${TECH_URL}/api/technicians/jobs/${id}/reject`, {
        token: techToken,
        body: { reason: "QA preflight cleanup" },
      });
      step("cleanup assigned job", true, id);
    }
  }
}

async function findAssignedJob(techToken) {
  const session = await getSession(techToken);
  const jobs = session.data?.active_jobs || [];
  const assigned = jobs.find((j) => j.job_status === "assigned");
  if (assigned) return assigned._id;
  if (session.data?.active_job?.job_status === "assigned") {
    return session.data.active_job._id;
  }
  return null;
}

async function main() {
  console.log(`\n=== Technician full-job QA ===`);
  console.log(`Tech API: ${TECH_URL}\n`);

  const { token: techToken, techId } = await loginTech();
  step("technician login", true, `techId=${techId}`);

  await preflightCleanup(techToken);

  let jobId = null;

  if (process.env.SKIP_ADMIN_CREATE !== "1") {
    try {
      const adminToken = await loginAdmin();
      step("admin login", true);
      const omarId = await findOmarId(adminToken);
      const sourceId = await findSourceId(adminToken);
      if (!omarId || !sourceId) {
        step("resolve omar/source", false, `omar=${omarId} source=${sourceId}`);
      } else {
        jobId = await createAssignedJob(adminToken, omarId, sourceId);
        step("admin create assigned job", !!jobId, jobId);
      }
    } catch (e) {
      step("admin setup", false, e.message);
    }
  }

  if (!jobId) {
    jobId = await findAssignedJob(techToken);
    step("find existing assigned job", !!jobId, jobId || "none");
  }

  if (!jobId) {
    console.log("\nNo assigned job available. Assign a Tires job to Omar in admin, then re-run.");
    process.exit(1);
  }

  let r = await json("POST", `${TECH_URL}/api/technicians/jobs/${jobId}/accept`, {
    token: techToken,
    body: {},
  });
  step("accept job", r.status === 200, `status=${r.status}`);

  r = await json("PATCH", `${TECH_URL}/api/jobs/${jobId}/status`, {
    token: techToken,
    body: { job_status: "en_route" },
  });
  step("en_route", r.status === 200, `status=${r.status}`);

  r = await json("POST", `${TECH_URL}/api/jobs/${jobId}/arrive`, {
    token: techToken,
    body: {},
  });
  step("arrived", r.status === 200, `status=${r.status}`);

  r = await json("POST", `${TECH_URL}/api/jobs/${jobId}/start`, {
    token: techToken,
    body: { latitude: TECH_LAT, longitude: TECH_LNG },
  });
  if (r.status !== 200) {
    // Retry once after clearing any new blocker
    await preflightCleanup(techToken);
    r = await json("POST", `${TECH_URL}/api/jobs/${jobId}/start`, {
      token: techToken,
      body: { latitude: TECH_LAT, longitude: TECH_LNG },
    });
  }
  step("start (proximity)", r.status === 200, r.data?.distanceMeters != null ? `${r.data.distanceMeters}m` : `status=${r.status} ${r.data?.error || ""}`);

  const form = new FormData();
  form.append("signature", new Blob([MIN_PNG], { type: "image/png" }), "sign.png");
  r = await json("POST", `${TECH_URL}/api/jobs/${jobId}/signature`, {
    token: techToken,
    form,
  });
  step("customer signature", r.status === 200, `status=${r.status}`);

  r = await json("POST", `${TECH_URL}/api/jobs/${jobId}/repairs`, {
    token: techToken,
    body: {
      name: "Wheel",
      description: "QA repair line — tire rotation",
      price: 50,
      cost: 20,
      notes: "QA test notes",
      quantity: 1,
    },
  });
  step("add repair", r.status === 200, `status=${r.status}`);

  r = await json("GET", `${TECH_URL}/api/jobs/${jobId}/total`, { token: techToken });
  step("calculate total", r.status === 200 && r.data?.profit != null, `total=${r.data?.total} profit=${r.data?.profit}`);

  r = await json("POST", `${TECH_URL}/api/jobs/${jobId}/complete`, {
    token: techToken,
    body: { notes: "QA completion" },
  });
  step("complete job", r.status === 200, `status=${r.status}`);

  r = await json("POST", `${TECH_URL}/api/jobs/${jobId}/payment`, {
    token: techToken,
    body: { payment_method: "cash" },
  });
  step("confirm payment", r.status === 200, `status=${r.status}`);

  r = await json("GET", `${TECH_URL}/api/jobs/${jobId}/activity-detail`, { token: techToken });
  const detailOk =
    r.status === 200 &&
    r.data?.job &&
    Array.isArray(r.data?.repairs) &&
    r.data?.pricing?.profit != null;
  step("activity-detail", detailOk, `repairs=${r.data?.repairs?.length} paid=${r.data?.job?.payment_status}`);

  const session = await getSession(techToken);
  const stillActive = session.data?.active_jobs?.some(
    (j) => j._id === jobId && j.job_status !== "completed"
  );
  step("session cleared job", !stillActive, `active_jobs=${session.data?.active_jobs?.length ?? 0}`);

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("QA aborted:", err.message);
  process.exit(1);
});
