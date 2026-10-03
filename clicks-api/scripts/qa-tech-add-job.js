#!/usr/bin/env node
/**
 * QA: Technician "Add job" intake flow (API + UI wiring checks).
 *
 * Usage:
 *   node scripts/qa-tech-add-job.js
 *   node scripts/qa-tech-multi-job-hold.js   # M1–M10 + H1–H7 matrix
 *
 * Env:
 *   TECH_URL, ADMIN_URL, TECH_PHONE, TECH_PASSWORD, ADMIN_EMAIL, ADMIN_PASSWORD
 *   KEEP_JOB=1   skip admin delete of the test job
 */
const fs = require("fs");
const path = require("path");

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
  return { status: res.status, data };
}

function checkUiWiring() {
  const techRoot = path.join(__dirname, "../../clicks-technician/lib");
  const files = [
    path.join(techRoot, "features/home/ui/view/home_screen.dart"),
    path.join(techRoot, "features/home/ui/view/activity_tab.dart"),
    path.join(techRoot, "features/home/ui/view/add_job_screen.dart"),
    path.join(techRoot, "features/home/ui/cubit/home_cubit.dart"),
  ];
  const missing = files.filter((f) => !fs.existsSync(f));
  if (missing.length) {
    step("UI files exist", false, missing.join(", "));
    return;
  }

  const home = fs.readFileSync(files[0], "utf8");
  const activity = fs.readFileSync(files[1], "utf8");
  const addJob = fs.readFileSync(files[2], "utf8");
  const cubit = fs.readFileSync(files[3], "utf8");

  step("home_screen navigates to AddJobScreen", home.includes("AddJobScreen"));
  // Multi-job: Add job is shown whenever the technician is online. The old
  // blocking-fulfill / incoming-dispatch gate was removed (see GAP-4 closed in
  // qa-tech-multi-job-hold-report.md), so assert the gate is absent.
  step(
    "Add job shown when online; no blocking fulfill gate (multi-job)",
    home.includes("canShowAddJob") &&
      cubit.includes("bool get canShowAddJob => isOnline") &&
      !home.includes("JobFulfillStatus.isBlocking")
  );
  step(
    "add job only on idle Home (not Activity tab)",
    !activity.includes("AddJobScreen"),
    "Activity tab has no create entry"
  );
  step("add_job_screen calls createJobCard", addJob.includes("createJobCard"));
  step("createJobCard surfaces API errors", cubit.includes("lastActionError"));
  step("add_job uses vehicle catalog", addJob.includes("VehicleMakeModelFields"));
}

async function loginTech() {
  const r = await json("POST", `${TECH_URL}/api/technicians/login`, {
    body: { phone: TECH_PHONE, password: TECH_PASSWORD },
  });
  if (r.status !== 200 || !r.data?.token) {
    throw new Error(`Tech login failed (${r.status}): ${r.data?.error || "no token"}`);
  }
  return {
    token: r.data.token,
    techId: r.data.technician?._id || r.data.id,
    techName: `${r.data.technician?.firstName || ""} ${r.data.technician?.lastName || ""}`.trim(),
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

function uniquePhoneSuffix() {
  return String(Date.now()).slice(-8);
}

async function main() {
  console.log("\n=== Technician Add Job QA ===");
  console.log(`Tech API:  ${TECH_URL}`);
  console.log(`Admin API: ${ADMIN_URL}\n`);

  console.log("--- Static UI wiring ---");
  checkUiWiring();

  console.log("\n--- API flow ---");

  const { token: techToken, techId, techName } = await loginTech();
  step("technician login", true, `${techName || techId}`);

  let r = await json("GET", `${TECH_URL}/api/vehicles/makes`);
  const makes = r.data?.makes || [];
  step("vehicle makes catalog", r.status === 200 && makes.length > 0, `count=${makes.length}`);

  const toyota = makes.find((m) => /toyota/i.test(m.makeName || m.name || ""));
  const makeId = toyota?._id || toyota?.id || makes[0]?._id || makes[0]?.id;
  const makeName = toyota?.makeName || toyota?.name || makes[0]?.makeName || "Toyota";

  r = await json("GET", `${TECH_URL}/api/vehicles/models?makeId=${makeId}`);
  const models = r.data?.models || [];
  step("vehicle models for make", r.status === 200 && models.length > 0, `${makeName} models=${models.length}`);

  const modelName = models[0]?.modelName || models[0]?.name || "Camry";
  const phone = uniquePhoneSuffix();

  const validBody = {
    clientName: "QA Add Job Customer",
    clientMobileNumber: phone,
    countryCode: "+974",
    vehicleMake: makeName,
    vehicleModel: modelName,
    issue: "QA add-job test — flat tire",
    location: `LatLng(${JOB_LAT}, ${JOB_LNG})`,
    dateTime: new Date().toISOString(),
    jobType: "Flat Tire",
    price: 175,
  };

  r = await json("POST", `${TECH_URL}/api/technicians/jobs`, {
    token: techToken,
    body: validBody,
  });
  const jobId = r.data?.job?._id || r.data?.job?.id;
  const createOk = (r.status === 200 || r.status === 201) && !!jobId;
  step("create technician job", createOk, createOk ? jobId : `${r.status} ${r.data?.error || JSON.stringify(r.data).slice(0, 80)}`);

  if (createOk) {
    const job = r.data.job;
    step("job auto-assigned to creator", createOk && job?.assignedTechnician, job?.assignedTechnician?._id || job?.assignedTechnician);
    step("job status accepted (ready to start)", job.job_status === "accepted", job.job_status);
    const creatorOk =
      String(job.created_by_technician || job.created_by_technician?._id || "") ===
        String(techId) ||
      !!job.createdByTechnicianName;
    step("job stamped with creator", creatorOk, job.createdByTechnicianName || job.created_by_technician);
    step("Technician App source", /technician/i.test(job.source?.mainSourceName || ""), job.source?.mainSourceName || "—");
    step("location coordinates parsed", Array.isArray(job.locationCoordinates?.coordinates), JSON.stringify(job.locationCoordinates?.coordinates || null));

    r = await json("GET", `${TECH_URL}/api/jobs/technician/session`, { token: techToken });
    const sessionJobs = r.data?.active_jobs || [];
    const sessionJob =
      sessionJobs.find((j) => String(j._id) === String(jobId)) ||
      (String(r.data?.active_job?._id) === String(jobId) ? r.data.active_job : null);
    step(
      "job in technician session",
      r.status === 200 && !!sessionJob,
      sessionJob?.job_status || `active_jobs=${sessionJobs.length}`
    );
  }

  // Validation negatives
  r = await json("POST", `${TECH_URL}/api/technicians/jobs`, {
    token: techToken,
    body: { ...validBody, clientName: "", clientMobileNumber: phone },
  });
  step("reject missing clientName", r.status === 400, `status=${r.status}`);

  r = await json("POST", `${TECH_URL}/api/technicians/jobs`, {
    token: techToken,
    body: { ...validBody, clientMobileNumber: "123", clientName: "Bad Phone" },
  });
  step("reject invalid phone", r.status === 400, `status=${r.status} ${r.data?.error || ""}`);

  r = await json("POST", `${TECH_URL}/api/technicians/jobs`, {
    token: techToken,
    body: { ...validBody, jobType: "InvalidType", clientMobileNumber: uniquePhoneSuffix() },
  });
  step("reject invalid jobType", r.status === 400, `status=${r.status}`);

  r = await json("POST", `${TECH_URL}/api/technicians/jobs`, {
    body: {},
  });
  step("reject unauthenticated", r.status === 401 || r.status === 403, `status=${r.status}`);

  // Activities list + admin visibility while still accepted
  let adminToken = null;
  if (createOk && jobId) {
    r = await json("GET", `${TECH_URL}/api/technicians/jobs`, { token: techToken });
    const list = r.data?.jobs || [];
    const createdJobVisible = list.some((j) => String(j._id) === String(jobId));
    step("technician jobs list endpoint", r.status === 200, `jobs=${list.length}`);
    step("created job visible in activities list", createdJobVisible, jobId);

    try {
      adminToken = await loginAdmin();
      step("admin login", true);

      r = await json("GET", `${ADMIN_URL}/api/jobs/${jobId}`, { token: adminToken });
      const adminJob = r.data?.job || r.data;
      step("admin can fetch created job", r.status === 200 && adminJob?._id, adminJob?.clientName);
      step("admin sees accepted status", adminJob?.job_status === "accepted", adminJob?.job_status);
      step("admin sees assigned technician", !!adminJob?.assignedTechnician, adminJob?.assignedTechnician?.firstName || adminJob?.assignedTechnician);
    } catch (e) {
      step("admin verification", false, e.message);
    }

    // Own-job start path: GPS not required
    r = await json("PATCH", `${TECH_URL}/api/jobs/${jobId}/status`, {
      token: techToken,
      body: { job_status: "en_route" },
    });
    step("own job en_route", r.status === 200, `status=${r.status}`);

    r = await json("POST", `${TECH_URL}/api/jobs/${jobId}/arrive`, {
      token: techToken,
      body: {},
    });
    step("own job arrived", r.status === 200, `status=${r.status}`);

    r = await json("POST", `${TECH_URL}/api/jobs/${jobId}/start`, {
      token: techToken,
      body: {}, // no latitude/longitude — own jobs skip GPS
    });
    step(
      "own job start without GPS",
      r.status === 200 && r.data?.job_status === "in_progress",
      r.status === 200
        ? `gpsSkipped=${r.data?.gpsSkipped === true}`
        : `${r.status} ${r.data?.error || ""}`
    );

    if (process.env.KEEP_JOB !== "1") {
      if (!adminToken) {
        try {
          adminToken = await loginAdmin();
        } catch (_) {}
      }
      if (adminToken) {
        r = await json("DELETE", `${ADMIN_URL}/api/jobs/${jobId}`, { token: adminToken });
        const deleted = r.status === 200 || r.status === 204;
        step("cleanup test job", deleted, deleted ? jobId : `status=${r.status}`);
      } else {
        step("cleanup test job", false, "no admin token");
      }
    } else {
      warn("cleanup skipped", `KEEP_JOB=1 jobId=${jobId}`);
    }
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed, ${warned} warnings ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("QA aborted:", err.message);
  process.exit(1);
});
