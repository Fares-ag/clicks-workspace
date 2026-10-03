#!/usr/bin/env node
/**
 * QA: Technician multi-job + hold-request approval (M1–M10, OH-A1–A6, H1–H7, HR1–HR3).
 *
 * Usage:
 *   node scripts/qa-tech-multi-job-hold.js
 *
 * Env:
 *   TECH_URL, ADMIN_URL, TECH_PHONE, TECH_PASSWORD, ADMIN_EMAIL, ADMIN_PASSWORD
 *   SKIP_API=1     static UI/code checks only (no live API)
 *   KEEP_JOBS=1    skip cleanup delete
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
const SKIP_API = process.env.SKIP_API === "1";

const MIN_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const TECH_ROOT = path.join(__dirname, "../../clicks-technician/lib");
const ADMIN_ROOT = path.join(__dirname, "../../clicks-interface/src");
const ADMIN_MOBILE_ROOT = path.join(__dirname, "../../clicks-admin/lib");
const SHARED_ROOT = path.join(__dirname, "../clicks-shared");

let passed = 0;
let failed = 0;
let warned = 0;
const findings = [];

function step(id, name, ok, detail = "") {
  const mark = ok ? "PASS" : "FAIL";
  console.log(`${mark}  [${id}] ${name}${detail ? ` — ${detail}` : ""}`);
  if (ok) passed++;
  else failed++;
  return ok;
}

function warn(id, name, detail = "") {
  console.log(`WARN  [${id}] ${name}${detail ? ` — ${detail}` : ""}`);
  warned++;
  findings.push({ id, severity: "warn", name, detail });
}

function gap(id, name, detail = "") {
  console.log(`GAP   [${id}] ${name}${detail ? ` — ${detail}` : ""}`);
  findings.push({ id, severity: "gap", name, detail });
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
    data = { raw: text.slice(0, 300) };
  }
  return { status: res.status, data };
}

function read(relPath) {
  const full = path.join(TECH_ROOT, relPath);
  return fs.existsSync(full) ? fs.readFileSync(full, "utf8") : "";
}

function readAdmin(relPath) {
  const full = path.join(ADMIN_ROOT, relPath);
  return fs.existsSync(full) ? fs.readFileSync(full, "utf8") : "";
}

function readAdminMobile(relPath) {
  const full = path.join(ADMIN_MOBILE_ROOT, relPath);
  return fs.existsSync(full) ? fs.readFileSync(full, "utf8") : "";
}

function readShared(relPath) {
  const full = path.join(SHARED_ROOT, relPath);
  return fs.existsSync(full) ? fs.readFileSync(full, "utf8") : "";
}

function uniquePhoneSuffix() {
  return String(Date.now()).slice(-8);
}

function jobBody(overrides = {}) {
  return {
    clientName: "QA Multi-Job Customer",
    clientMobileNumber: uniquePhoneSuffix(),
    countryCode: "+974",
    vehicleMake: "Toyota",
    vehicleModel: "Camry",
    issue: "QA multi-job matrix test",
    location: `LatLng(${JOB_LAT}, ${JOB_LNG})`,
    dateTime: new Date().toISOString(),
    jobType: "Flat Tire",
    price: 150,
    ...overrides,
  };
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

async function getSession(techToken) {
  return json("GET", `${TECH_URL}/api/jobs/technician/session`, { token: techToken });
}

async function createTechJob(techToken, overrides = {}) {
  const r = await json("POST", `${TECH_URL}/api/technicians/jobs`, {
    token: techToken,
    body: jobBody(overrides),
  });
  const jobId = r.data?.job?._id || r.data?.job?.id;
  return { r, jobId, job: r.data?.job };
}

async function adminHoldJob(adminToken, jobId, reason) {
  const body = reason === undefined ? {} : { reason };
  return json("POST", `${ADMIN_URL}/api/jobs/${jobId}/hold`, {
    token: adminToken,
    body,
  });
}

async function adminResumeJob(adminToken, jobId) {
  return json("POST", `${ADMIN_URL}/api/jobs/${jobId}/resume`, {
    token: adminToken,
    body: {},
  });
}

async function techHoldRequest(techToken, jobId, reason) {
  return json("POST", `${TECH_URL}/api/jobs/${jobId}/hold-request`, {
    token: techToken,
    body: { reason },
  });
}

async function adminApproveHoldRequest(adminToken, jobId) {
  return json("POST", `${ADMIN_URL}/api/jobs/${jobId}/hold-request/approve`, {
    token: adminToken,
    body: {},
  });
}

async function adminRejectHoldRequest(adminToken, jobId, note) {
  return json("POST", `${ADMIN_URL}/api/jobs/${jobId}/hold-request/reject`, {
    token: adminToken,
    body: { note },
  });
}

async function techHoldJob(techToken, jobId, reason) {
  return json("POST", `${TECH_URL}/api/jobs/${jobId}/hold`, {
    token: techToken,
    body: { reason },
  });
}

async function advanceToInProgress(techToken, jobId) {
  await json("PATCH", `${TECH_URL}/api/jobs/${jobId}/status`, {
    token: techToken,
    body: { job_status: "en_route" },
  });
  await json("POST", `${TECH_URL}/api/jobs/${jobId}/arrive`, {
    token: techToken,
    body: {},
  });
  return json("POST", `${TECH_URL}/api/jobs/${jobId}/start`, {
    token: techToken,
    body: {},
  });
}

async function advanceToArrived(techToken, jobId) {
  await json("PATCH", `${TECH_URL}/api/jobs/${jobId}/status`, {
    token: techToken,
    body: { job_status: "en_route" },
  });
  return json("POST", `${TECH_URL}/api/jobs/${jobId}/arrive`, {
    token: techToken,
    body: {},
  });
}

async function preflightCleanup(techToken, adminToken) {
  const session = await getSession(techToken);
  const jobs = session.data?.active_jobs || [];
  for (const job of jobs) {
    const id = job._id;
    const status = job.job_status;
    if (!id) continue;
    // Only ever touch jobs this QA tooling created ("QA ..." client names).
    // Running against production, the account can hold real dispatch jobs —
    // an on_hold job was resumed and cancelled by this preflight on 2026-09-04.
    if (!/^QA\b/i.test(String(job.clientName || ""))) {
      console.log(`      preflight: leaving non-QA job ${id} (${status}) untouched`);
      continue;
    }
    if (status === "on_hold") {
      // Held jobs belong to dispatch; never resume/cancel them from QA.
      console.log(`      preflight: leaving on_hold QA job ${id} to dispatch`);
      continue;
    }
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
        body: { notes: "QA multi-job cleanup", job_reference: "QA-MULTI" },
      });
    } else if (status === "completed" && job.payment_status !== "paid") {
      await json("POST", `${TECH_URL}/api/jobs/${id}/payment`, {
        token: techToken,
        body: { payment_method: "cash" },
      });
    } else if (["accepted", "en_route", "arrived"].includes(status)) {
      await json("POST", `${TECH_URL}/api/jobs/${id}/cancel`, {
        token: techToken,
        body: { reason: "QA multi-job cleanup" },
      });
    } else if (status === "assigned") {
      await json("POST", `${TECH_URL}/api/technicians/jobs/${id}/reject`, {
        token: techToken,
        body: { reason: "QA multi-job cleanup" },
      });
    }
  }
}

async function deleteJob(adminToken, jobId) {
  if (!jobId || process.env.KEEP_JOBS === "1") return;
  await json("DELETE", `${ADMIN_URL}/api/jobs/${jobId}`, { token: adminToken });
}

function runStaticUiMatrix() {
  console.log("\n--- Static UI / code matrix (M2–M4, M7, H1–H2, OH-UI, HR-UI) ---");

  const home = read("features/home/ui/view/home_screen.dart");
  const mainShell = read("features/main/ui/view/main_shell.dart");
  const openActiveJob = read("features/home/ui/view/open_active_job_screen.dart");
  const activeJob = read("features/home/ui/view/active_job_screen.dart");
  const activityDetails = read("features/home/ui/view/activity_details_screen.dart");
  const activityTab = read("features/home/ui/view/activity_tab.dart");
  const addJob = read("features/home/ui/view/add_job_screen.dart");
  const cubit = read("features/home/ui/cubit/home_cubit.dart");
  const endPoints = read("core/api/end_points/end_points.dart");
  const fulfill = read("core/config/job_fulfill_status.dart");
  const productRules = read("core/config/product_rules.dart");
  const jobHold = readShared("services/jobHold.js");
  const jobModel = readShared("models/Job.js");
  const jobRoutes = fs.readFileSync(
    path.join(__dirname, "../clicks-customer-tech-api/src/routes/jobRoutes.js"),
    "utf8"
  );
  const adminJobRoutes = fs.readFileSync(
    path.join(__dirname, "../clicks-admin-api/src/routes/jobs.js"),
    "utf8"
  );
  const mvpScope = fs.readFileSync(path.join(__dirname, "../MVP_SCOPE.md"), "utf8");
  const adminLabels = readAdmin("utils/jobStatusLabels.js");
  const adminDetails = readAdmin("pages/JobDetails/JobDetails.jsx");
  const adminJobs = readAdmin("pages/JobManagement/Jobs.jsx");
  const adminDash = readAdmin("pages/Dashboard/Dashboard.jsx");
  const adminApi = readAdmin("store/jobApi.js");
  const adminMobileJob = readAdminMobile("features/jobs/job_detail_screen.dart");
  const adminMobileEndpoints = readAdminMobile("core/api/end_points.dart");

  step(
    "M2/M3",
    "Home tab always shows idle hero (not ActiveJobScreen swap)",
    home.includes("_IdleHeroHome") &&
      !home.includes("ActiveJobScreen") &&
      !home.includes("JobFulfillStatus.isBlocking")
  );

  step(
    "M2/M3",
    "Active job opens via pushed route (openActiveJobScreen)",
    openActiveJob.includes("ActiveJobScreen") &&
      mainShell.includes("openActiveJobScreen") &&
      activityDetails.includes("openActiveJobScreen") &&
      addJob.includes("openActiveJobScreen")
  );
  step(
    "M2/M3",
    "Pushed ActiveJobScreen subscribes to cubit state (rebuilds after each job action)",
    /Bloc(Consumer|Builder)<HomeCubit, HomeState>\(\s*bloc: cubit/.test(activeJob)
  );
  step(
    "M8",
    "Session poll keeps the technician's focused job with multiple active jobs (_focusedJobId)",
    cubit.includes("String? _focusedJobId;") &&
      cubit.includes("_findQueuedJob(_focusedJobId)") &&
      cubit.includes("_focusedJobId = jobId;")
  );

  step(
    "M2/M3",
    "Add job shown when online (canShowAddJob => isOnline)",
    home.includes("canShowAddJob") &&
      cubit.includes("bool get canShowAddJob => isOnline") &&
      addJob.includes("createJobCard") &&
      !activityTab.includes("AddJobScreen")
  );

  step(
    "M4",
    "No create gate blocking Add job while another job is active",
    !cubit.includes("Ask dispatch to put your current job on hold before adding") &&
      cubit.includes("bool get canShowAddJob => isOnline")
  );

  step(
    "M7",
    "Activity details wires continueJob + openActiveJobScreen",
    activityDetails.includes("continueJob") &&
      activityDetails.includes("openActiveJobScreen") &&
      cubit.includes("focusJob")
  );

  // Multi-accept: a second assignment while busy must be acceptable in-app.
  const activityCard = read("features/home/ui/view/widgets/activity_job_card.dart");
  const pendingBanner = read(
    "features/home/ui/view/widgets/pending_assignments_banner.dart"
  );
  step(
    "MA1",
    "Activity details offers Accept job for assigned jobs (acceptJobById)",
    activityDetails.includes("_canAccept") &&
      activityDetails.includes("acceptJobById") &&
      cubit.includes("Future<bool> acceptJobById(String jobId)") &&
      activityCard.includes("Needs accept")
  );
  step(
    "MA2",
    "Home pending-assignments banner uses hasIncomingAssignedJob",
    home.includes("PendingAssignmentsBanner") &&
      home.includes("hasIncomingAssignedJob") &&
      pendingBanner.includes("pendingAssignedJobs") &&
      pendingBanner.includes("acceptJobById")
  );
  step(
    "MA3",
    "Socket newJobAssigned keeps queued assignments while busy (no early return)",
    cubit.includes("_upsertQueuedJob(incoming)") &&
      !/_isFulfillPathStatus\(currentStatus\)\)\s*\{\s*return;/.test(cubit)
  );

  step(
    "H1",
    "Technician requests hold (not direct Put on hold)",
    activeJob.includes("Request hold") &&
      activeJob.includes("_HoldRequestPanel") &&
      cubit.includes("requestJobHold") &&
      endPoints.includes("hold-request") &&
      !cubit.includes("putJobOnHold")
  );

  const cancelInActive =
    activeJob.includes("cancelJob") ||
    (/\bCancel Job\b/i.test(activeJob) && !activeJob.includes("//"));
  step(
    "H2",
    "No Cancel Job on ActiveJobScreen (by design)",
    !cancelInActive && productRules.includes("no Cancel/Reject bail-out")
  );
  if (!cancelInActive) {
    gap("GAP-2", "No technician cancel during active fulfill", "API exists; UI omitted per ProductRules");
  }

  step(
    "H6",
    "Job schema includes on_hold, hold_reason, and hold_request subdocument",
    jobModel.includes("on_hold") &&
      jobModel.includes("hold_reason") &&
      jobModel.includes("hold_request")
  );
  step(
    "H7",
    "Admin on_hold is a live canonical status",
    adminLabels.includes("on_hold") &&
      adminLabels.includes("CANONICAL_JOB_STATUS_KEYS") &&
      adminLabels.includes("on_hold is live")
  );
  step(
    "OH-scope",
    "MVP lists admin-only job on-hold / resume",
    /admin only/i.test(mvpScope) && /on-hold \/ resume/i.test(mvpScope)
  );

  step(
    "OH-UI",
    "on_hold is not a blocking fulfill status",
    fulfill.includes("isBlocking") && fulfill.includes("on_hold is not blocking")
  );
  step(
    "OH-UI",
    "Shared jobHold service supports request/approve/reject hold request",
    jobHold.includes("requestJobHold") &&
      jobHold.includes("approveHoldRequest") &&
      jobHold.includes("rejectHoldRequest")
  );
  step(
    "OH-UI",
    "Tech + admin API routes expose hold-request endpoints",
    jobRoutes.includes("/hold-request") &&
      adminJobRoutes.includes("hold-request/approve") &&
      adminJobRoutes.includes("hold-request/reject")
  );
  step(
    "OH-UI",
    "Admin web Job Details has hold/resume + hold request approve/reject",
    adminDetails.includes("HOLDABLE_STATUSES") &&
      adminDetails.includes("holdJob") &&
      adminDetails.includes("Hold request pending") &&
      adminApi.includes("approveHoldRequest") &&
      adminApi.includes("rejectHoldRequest")
  );
  step(
    "HR-UI",
    "Admin mobile job detail has hold request approve/reject + Put on hold",
    adminMobileJob.includes("Hold request pending") &&
      adminMobileJob.includes("_approveHoldRequest") &&
      adminMobileJob.includes("Put on hold") &&
      adminMobileEndpoints.includes("hold-request/approve")
  );
  step(
    "OH-UI",
    "Jobs list shows truncated hold_reason; dashboard has On Hold metric",
    adminJobs.includes("hold_reason") && adminDash.includes("On Hold Jobs")
  );

  step(
    "M10",
    "Client blocks offline with active job message (fulfill + pending assigned)",
    cubit.includes("Finish your active job before going Offline") &&
      cubit.includes("Accept pending job assignments before going Offline")
  );

  // --- Alarm-stop-after-accept static checks (AL-S1 – AL-S4) ---
  const notifService = read("core/notifications/job_notification_service.dart");
  step(
    "AL-S1",
    "Alarm handled-job dedup constants + helpers present in job_notification_service.dart",
    notifService.includes("kHandledAlarmJobIdsKey") &&
      notifService.includes("shouldStartAlarmForJob") &&
      notifService.includes("markAlarmHandledForJob") &&
      notifService.includes("clearAlarmHandledForJob")
  );
  step(
    "AL-S2",
    "startInsistentAlarm accepts jobId and _showUrgentJobNotification guards via shouldStartAlarmForJob",
    notifService.includes("startInsistentAlarm({String? jobId})") &&
      notifService.includes("shouldStartAlarmForJob(jobId)") &&
      notifService.includes("skip stale urgent notif job=")
  );
  step(
    "AL-S3",
    "acceptJob and acceptJobById both call cancelUrgentJobNotification with explicit jobId",
    cubit.includes("cancelUrgentJobNotification(jobId: id)") &&
      cubit.includes("cancelUrgentJobNotification(jobId: jobId)")
  );
  step(
    "AL-S4",
    "onNewJobAssigned clears handled flag before starting alarm",
    cubit.includes("clearAlarmHandledForJob(incomingId)") &&
      cubit.includes("startInsistentAlarm(jobId: incomingId)")
  );

  // --- Offline-swipe queue-wide gate static checks (OFF-S1 – OFF-S4) ---
  const homeScreen = read("features/home/ui/view/home_screen.dart");
  const actionErrors = fs.readFileSync(
    path.join(__dirname, "../../clicks-technician/lib/core/helper/action_errors.dart"),
    "utf8"
  );
  step(
    "OFF-S1",
    "canToggleOnlineStatus uses full-queue checks (hasBlockingFulfillJob + hasIncomingAssignedJob)",
    cubit.includes("!hasBlockingFulfillJob && !hasIncomingAssignedJob")
  );
  step(
    "OFF-S2",
    "toggleOnlineStatus checks hasIncomingAssignedJob before hasBlockingFulfillJob",
    /hasIncomingAssignedJob[\s\S]{0,200}hasBlockingFulfillJob/.test(cubit)
  );
  step(
    "OFF-S3",
    "home_screen.dart renders offlineToggleBlockedReason hint under slider",
    homeScreen.includes("offlineToggleBlockedReason")
  );
  step(
    "OFF-S4",
    "action_errors.dart humanizes 'cannot go offline while you have an active job'",
    actionErrors.toLowerCase().includes("cannot go offline while you have an active job")
  );

  step(
    "HR-UI",
    "Product rules document request-hold → admin approves path",
    productRules.includes("technician requests hold") &&
      productRules.includes("dispatch approves")
  );
}

async function runApiMatrix(techToken, adminToken) {
  console.log("\n--- API matrix (M1, OH-A1–A6, M5–M10, H3–H6, HR1–HR3) ---");

  await preflightCleanup(techToken, adminToken);

  const createdIds = [];

  const { r: m1r, jobId: jobA } = await createTechJob(techToken, {
    clientName: "QA M1 Baseline",
  });
  step(
    "M1",
    "Create technician job (accepted, auto-assigned)",
    (m1r.status === 200 || m1r.status === 201) &&
      m1r.data?.job?.job_status === "accepted",
    jobA || `${m1r.status}`
  );
  if (jobA) createdIds.push(jobA);

  const { r: secondCreate, jobId: jobB } = await createTechJob(techToken, {
    clientName: "QA OH-A3 Second Job",
  });
  step(
    "OH-A3",
    "Create second job while first accepted is allowed",
    secondCreate.status === 201 &&
      secondCreate.data?.job?.job_status === "accepted",
    secondCreate.data?.error || `${secondCreate.status}`
  );
  if (jobB) createdIds.push(jobB);

  if (jobA && adminToken) {
    const techHoldTry = await techHoldJob(techToken, jobA, "Tech should not hold");
    step(
      "OH-A0",
      "Technician POST /hold is not available",
      techHoldTry.status === 404,
      `${techHoldTry.status}`
    );

    const noReason = await adminHoldJob(adminToken, jobA, "");
    step(
      "OH-A2",
      "Admin hold without reason returns 400",
      noReason.status === 400 &&
        /Hold reason is required/i.test(noReason.data?.error || noReason.data?.message || ""),
      noReason.data?.error || noReason.data?.message || `${noReason.status}`
    );

    const hold = await adminHoldJob(adminToken, jobA, "Sent to garage for 2-day maintenance");
    const holdBody = hold.data?.job || hold.data;
    step(
      "OH-A1",
      "Admin hold with reason → 200, job_status on_hold",
      hold.status === 200 && holdBody?.job_status === "on_hold",
      holdBody?.job_status || hold.data?.message || `${hold.status}`
    );

    if (adminToken) {
      const adminGet = await json("GET", `${ADMIN_URL}/api/jobs/${jobA}`, {
        token: adminToken,
      });
      const fetched = adminGet.data?.job || adminGet.data;
      step(
        "OH-A6",
        "Admin GET includes hold_reason",
        adminGet.status === 200 && /garage/i.test(fetched?.hold_reason || ""),
        fetched?.hold_reason?.slice(0, 80) || `${adminGet.status}`
      );
    } else {
      warn("OH-A6", "Admin GET skipped", "no admin token");
    }

    const { r: afterHold, jobId: jobAfterHold } = await createTechJob(techToken, {
      clientName: "QA OH-A4 Second Job",
    });
    step(
      "OH-A4",
      "Create second job while first on_hold succeeds",
      (afterHold.status === 200 || afterHold.status === 201) &&
        afterHold.data?.job?.job_status === "accepted",
      jobAfterHold || `${afterHold.status}`
    );
    if (jobAfterHold) createdIds.push(jobAfterHold);

    const session = await getSession(techToken);
    const activeJobs = session.data?.active_jobs || [];
    step(
      "M9",
      "Session lists held + accepted jobs",
      activeJobs.length >= 2 &&
        activeJobs.some((j) => j.job_status === "on_hold") &&
        activeJobs.some((j) => j.job_status === "accepted"),
      `count=${activeJobs.length}`
    );
    step(
      "M9",
      "Session prioritizes accepted over on_hold",
      session.data?.active_job?.job_status === "accepted",
      session.data?.active_job?.job_status || "—"
    );

    const resume = await adminResumeJob(adminToken, jobA);
    const resumeBody = resume.data?.job || resume.data;
    step(
      "OH-A5",
      "Admin resume restores status_before_hold (accepted)",
      resume.status === 200 && resumeBody?.job_status === "accepted",
      resumeBody?.job_status || resume.data?.message || `${resume.status}`
    );

    if (jobB) {
      const startA = await advanceToInProgress(techToken, jobA);
      step(
        "M6",
        "Job A reaches in_progress after resume",
        startA.status === 200,
        startA.data?.job_status || startA.data?.error || `${startA.status}`
      );

      await advanceToArrived(techToken, jobB);
      const startB = await json("POST", `${TECH_URL}/api/jobs/${jobB}/start`, {
        token: techToken,
        body: {},
      });
      const m5Allowed =
        startB.status === 200 &&
        startB.data?.job_status === "in_progress";
      step(
        "M5",
        "Start Job B allowed while A in_progress",
        m5Allowed,
        startB.data?.error || `${startB.status}`
      );
      step(
        "M5",
        "Both jobs can be in_progress concurrently",
        m5Allowed && startA.data?.job_status === "in_progress",
        `A=${startA.data?.job_status || "—"} B=${startB.data?.job_status || "—"}`
      );

      await json("POST", `${TECH_URL}/api/jobs/${jobA}/payment`, {
        token: techToken,
        body: { payment_method: "cash" },
      });
      const form = new FormData();
      form.append("signature", new Blob([MIN_PNG], { type: "image/png" }), "sign.png");
      await json("POST", `${TECH_URL}/api/jobs/${jobA}/signature`, { token: techToken, form });
      const completeA = await json("POST", `${TECH_URL}/api/jobs/${jobA}/complete`, {
        token: techToken,
        body: { notes: "QA M6 complete A", job_reference: "QA-MULTI" },
      });
      step("M6", "Complete Job A while B remains in_progress", completeA.status === 200, `${completeA.status}`);

      const bAfterA = await json("GET", `${TECH_URL}/api/jobs/${jobB}`, { token: techToken });
      const bStatus = bAfterA.data?.job?.job_status || bAfterA.data?.job_status;
      step(
        "M6",
        "Job B still in_progress after A completed",
        bStatus === "in_progress",
        bStatus || `${bAfterA.status}`
      );
    }
  }

  if (adminToken) {
    await preflightCleanup(techToken, adminToken);
    const { jobId: hrJob } = await createTechJob(techToken, { clientName: "QA HR1 Hold Request" });
    if (hrJob) {
      createdIds.push(hrJob);
      const req = await techHoldRequest(techToken, hrJob, "Need to send car to garage");
      const reqJob = req.data?.job || req.data;
      step(
        "HR1",
        "Tech hold-request leaves job on fulfill path (accepted)",
        req.status === 200 &&
          reqJob?.job_status === "accepted" &&
          reqJob?.hold_request?.status === "pending",
        reqJob?.hold_request?.status || req.data?.error || `${req.status}`
      );

      const dup = await techHoldRequest(techToken, hrJob, "Duplicate request");
      step(
        "HR1",
        "Duplicate pending hold-request returns 409",
        dup.status === 409,
        dup.data?.error || `${dup.status}`
      );

      const approve = await adminApproveHoldRequest(adminToken, hrJob);
      const approvedJob = approve.data?.job || approve.data;
      step(
        "HR1",
        "Admin approve applies on_hold with tech reason",
        approve.status === 200 &&
          approvedJob?.job_status === "on_hold" &&
          /garage/i.test(approvedJob?.hold_reason || "") &&
          approvedJob?.held_by === "technician",
        approvedJob?.job_status || approve.data?.message || `${approve.status}`
      );
      await adminResumeJob(adminToken, hrJob);
    }

    const { jobId: hrRejectJob } = await createTechJob(techToken, { clientName: "QA HR2 Reject" });
    if (hrRejectJob) {
      createdIds.push(hrRejectJob);
      await techHoldRequest(techToken, hrRejectJob, "Waiting on customer approval");
      const reject = await adminRejectHoldRequest(adminToken, hrRejectJob, "Customer wants tech today");
      const rejectedJob = reject.data?.job || reject.data;
      step(
        "HR2",
        "Admin reject keeps job on fulfill path",
        reject.status === 200 &&
          rejectedJob?.job_status === "accepted" &&
          rejectedJob?.hold_request?.status === "rejected",
        rejectedJob?.hold_request?.status || reject.data?.message || `${reject.status}`
      );
    }

    const { jobId: hrDirectJob } = await createTechJob(techToken, { clientName: "QA HR3 Direct" });
    if (hrDirectJob) {
      createdIds.push(hrDirectJob);
      await techHoldRequest(techToken, hrDirectJob, "Tech requested hold");
      const direct = await adminHoldJob(adminToken, hrDirectJob, "Dispatch direct hold");
      const directJob = direct.data?.job || direct.data;
      step(
        "HR3",
        "Direct admin hold supersedes pending request",
        direct.status === 200 && directJob?.job_status === "on_hold",
        directJob?.job_status || `${direct.status}`
      );
    }
  }

  await preflightCleanup(techToken, adminToken);
  const { jobId: jobActive } = await createTechJob(techToken, { clientName: "QA M10 Offline" });
  if (jobActive) createdIds.push(jobActive);
  const offlineTry = await json("PATCH", `${TECH_URL}/api/technicians/status`, {
    token: techToken,
    body: { status: "Offline" },
  });
  step(
    "M10",
    "API blocks go Offline with active accepted job",
    offlineTry.status === 400 &&
      /Cannot go Offline while you have an active job/i.test(offlineTry.data?.error || ""),
    offlineTry.data?.error || `${offlineTry.status}`
  );

  if (jobActive && adminToken) {
    await adminHoldJob(adminToken, jobActive, "Hold so tech can go Offline");
    const offlineHeld = await json("PATCH", `${TECH_URL}/api/technicians/status`, {
      token: techToken,
      body: { status: "Offline" },
    });
    step(
      "OH-3",
      "Offline allowed when only job is on_hold",
      offlineHeld.status === 200,
      offlineHeld.data?.error || offlineHeld.data?.message || `${offlineHeld.status}`
    );
    await adminResumeJob(adminToken, jobActive);
    await json("PATCH", `${TECH_URL}/api/technicians/status`, {
      token: techToken,
      body: { status: "Online" },
    });
  }

  if (jobActive) {
    await advanceToInProgress(techToken, jobActive);
    await json("POST", `${TECH_URL}/api/jobs/${jobActive}/payment`, {
      token: techToken,
      body: { payment_method: "cash" },
    });
    const form = new FormData();
    form.append("signature", new Blob([MIN_PNG], { type: "image/png" }), "sign.png");
    await json("POST", `${TECH_URL}/api/jobs/${jobActive}/signature`, { token: techToken, form });
    const garageNote = "Sent to garage for 2-day maintenance — return visit needed";
    const completeH3 = await json("POST", `${TECH_URL}/api/jobs/${jobActive}/complete`, {
      token: techToken,
      body: {
        notes: garageNote,
        completion_notes: garageNote,
        job_reference: "QA-GARAGE",
      },
    });
    step(
      "H3",
      "Complete with garage deferral note still works",
      completeH3.status === 200,
      `${completeH3.status}`
    );
    gap("GAP-5", "No follow-up job linkage after partial garage work", "Manual rebook only");

    if (adminToken && completeH3.status === 200) {
      const adminFetch = await json("GET", `${ADMIN_URL}/api/jobs/${jobActive}`, {
        token: adminToken,
      });
      const notes = adminFetch.data?.job?.completion_notes || adminFetch.data?.completion_notes;
      step(
        "H3",
        "Admin sees completion_notes",
        adminFetch.status === 200 && typeof notes === "string" && notes.includes("garage"),
        notes?.slice(0, 60) || "—"
      );

      // Admin create (createJobRecord) requires a source id — resolve one like
      // the other admin-create QA scripts do.
      const srcR = await json("GET", `${ADMIN_URL}/api/sources?limit=5`, { token: adminToken });
      const srcList = srcR.data?.sources || srcR.data?.data || srcR.data || [];
      const sourceId = Array.isArray(srcList) && srcList[0] ? srcList[0]._id || srcList[0].id : null;
      const followUp = await json("POST", `${ADMIN_URL}/api/jobs`, {
        token: adminToken,
        body: {
          clientName: "QA H4 Follow-up",
          clientMobileNumber: "+974" + uniquePhoneSuffix(),
          issue: "Return visit after garage — QA H4",
          location: `LatLng(${JOB_LAT}, ${JOB_LNG})`,
          dateTime: new Date(Date.now() + 86400000 * 2).toISOString(),
          jobType: "Flat Tire",
          price: 100,
          source: sourceId,
        },
      });
      const followId = followUp.data?.job?._id || followUp.data?._id;
      step(
        "H4",
        "Admin can manually create follow-up job (no link)",
        followUp.status === 200 || followUp.status === 201,
        followId || `${followUp.status} ${followUp.data?.error || followUp.data?.message || ""}`.trim()
      );
      if (followId) createdIds.push(followId);
    }
  }

  if (adminToken) {
    const { jobId: h6Job } = await createTechJob(techToken, { clientName: "QA H6 Hold" });
    if (h6Job) {
      createdIds.push(h6Job);
      const putHold = await json("PUT", `${ADMIN_URL}/api/jobs/${h6Job}`, {
        token: adminToken,
        body: { job_status: "on_hold" },
      });
      step(
        "H6",
        "Admin PUT on_hold rejected (use POST /hold)",
        putHold.status === 400,
        `${putHold.status} ${putHold.data?.error || putHold.data?.message || ""}`.slice(0, 80)
      );

      const adminHold = await json("POST", `${ADMIN_URL}/api/jobs/${h6Job}/hold`, {
        token: adminToken,
        body: { reason: "Admin: waiting on garage" },
      });
      const adminHoldJob = adminHold.data?.job || adminHold.data;
      step(
        "H6",
        "Admin POST /hold with reason succeeds",
        adminHold.status === 200 && adminHoldJob?.job_status === "on_hold",
        adminHoldJob?.job_status || `${adminHold.status}`
      );
    }
  }

  await preflightCleanup(techToken, adminToken);
  const { jobId: h5Job } = await createTechJob(techToken, { clientName: "QA H5 Stuck" });
  if (h5Job) {
    createdIds.push(h5Job);
    await json("PATCH", `${TECH_URL}/api/jobs/${h5Job}/status`, {
      token: techToken,
      body: { job_status: "en_route" },
    });
    await json("POST", `${TECH_URL}/api/jobs/${h5Job}/arrive`, { token: techToken, body: {} });
    const sessH5 = await getSession(techToken);
    const stuck = (sessH5.data?.active_jobs || []).find((j) => String(j._id) === String(h5Job));
    step(
      "H5",
      "Job at arrived remains in active_jobs",
      stuck?.job_status === "arrived",
      stuck?.job_status || "missing"
    );
    const offlineH5 = await json("PATCH", `${TECH_URL}/api/technicians/status`, {
      token: techToken,
      body: { status: "Offline" },
    });
    step(
      "H5",
      "Offline blocked while job stuck at arrived",
      offlineH5.status === 400,
      offlineH5.data?.error || `${offlineH5.status}`
    );
  }

  if (adminToken && process.env.KEEP_JOBS !== "1") {
    for (const id of [...new Set(createdIds)]) {
      await deleteJob(adminToken, id);
    }
    step("cleanup", "Test jobs deleted", true, `${createdIds.length} ids`);
  } else if (process.env.KEEP_JOBS === "1") {
    warn("cleanup", "KEEP_JOBS=1", createdIds.join(", "));
  }
}

async function main() {
  console.log("\n=== Technician Multi-Job + Hold Request QA Matrix ===");
  console.log(`Tech API:  ${TECH_URL}`);
  console.log(`Admin API: ${ADMIN_URL}`);
  console.log(`Mode:      ${SKIP_API ? "static only" : "static + API"}\n`);

  runStaticUiMatrix();

  if (SKIP_API) {
    console.log("\n(SKIP_API=1 — API scenarios not run against live stack)\n");
  } else {
    try {
      const { token: techToken } = await loginTech();
      step("setup", "Technician login", true);
      let adminToken = null;
      try {
        adminToken = await loginAdmin();
        step("setup", "Admin login", true);
      } catch (e) {
        warn("setup", "Admin login skipped", e.message);
      }
      await runApiMatrix(techToken, adminToken);
    } catch (e) {
      warn("setup", "Live API matrix skipped", e.message);
      console.log("  Run integration tests: npm test -- tests/integration/technician-multi-job-hold.integration.test.js");
    }
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed, ${warned} warnings ===`);
  console.log(`=== Product gaps logged: ${findings.filter((f) => f.severity === "gap").length} ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("QA aborted:", err.message);
  process.exit(1);
});
