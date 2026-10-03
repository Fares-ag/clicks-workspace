#!/usr/bin/env node
/**
 * Technician app user-journey QA — from starting a job to completing it.
 *
 * Mirrors what the Flutter app (clicks-technician) actually does at each step:
 *   Go Online → assignment appears (session / incoming banner) → Accept →
 *   Start En Route → I've Arrived → Start Job (GPS proximity, own-job bypass) →
 *   add repair / total → Collect Payment → customer signature →
 *   Complete Job (Job ID required) → Activity / receipt → earnings → Offline.
 *
 * Part 1 — static wiring: each screen action calls the cubit method that hits
 *          the endpoint the API exposes, with the same client-side gates.
 * Part 2 — live API journey against Railway using the same endpoints, bodies
 *          and order as the app, including every gate the app surfaces.
 *
 * Usage:
 *   node scripts/qa-tech-user-journey.js           # static + live
 *   SKIP_API=1 node scripts/qa-tech-user-journey.js # static only
 *
 * Env: TECH_URL, ADMIN_URL, TECH_PHONE, TECH_PASSWORD, ADMIN_EMAIL, ADMIN_PASSWORD
 */
const fs = require("fs");
const path = require("path");

const TECH_URL = (process.env.TECH_URL || "https://clicks-tech-api-production.up.railway.app").replace(/\/$/, "");
const ADMIN_URL = (process.env.ADMIN_URL || "https://clicks-admin-api-production.up.railway.app").replace(/\/$/, "");
const TECH_PHONE = process.env.TECH_PHONE || "+97411111111";
const TECH_PASSWORD = process.env.TECH_PASSWORD || "Tech123!";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@clicks.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin123!";
const SKIP_API = process.env.SKIP_API === "1";

/** Doha coords — job location, a near GPS fix (<200m) and a far one. */
const JOB_LAT = 25.3269467;
const JOB_LNG = 51.4883967;
const NEAR_LAT = 25.3271655;
const NEAR_LNG = 51.4889506;
const FAR_LAT = 25.2854;
const FAR_LNG = 51.531;

const MIN_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

let passed = 0;
let failed = 0;
let warned = 0;

function step(id, name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  [${id}] ${name}${detail ? ` — ${detail}` : ""}`);
  if (ok) passed++;
  else failed++;
  return ok;
}
function warn(id, name, detail = "") {
  console.log(`WARN  [${id}] ${name}${detail ? ` — ${detail}` : ""}`);
  warned++;
}

// ---------------------------------------------------------------------------
// Part 1 — static wiring (technician app ↔ API)
// ---------------------------------------------------------------------------
const TECH_ROOT = path.join(__dirname, "../../clicks-technician/lib");
function read(rel) {
  const full = path.join(TECH_ROOT, rel);
  return fs.existsSync(full) ? fs.readFileSync(full, "utf8") : "";
}
function readApi(rel) {
  const full = path.join(__dirname, "..", rel);
  return fs.existsSync(full) ? fs.readFileSync(full, "utf8") : "";
}

function runStaticJourney() {
  console.log("\n--- Part 1: app wiring for the job journey (static) ---");
  const cubit = read("features/home/ui/cubit/home_cubit.dart");
  const home = read("features/home/ui/view/home_screen.dart");
  const mainShell = read("features/main/ui/view/main_shell.dart");
  const active = read("features/home/ui/view/active_job_screen.dart");
  const complete = read("features/home/ui/view/complete_job_sheet.dart");
  const activityDetails = read("features/home/ui/view/activity_details_screen.dart");
  const endPoints = read("core/api/end_points/end_points.dart");
  const actionErrors = read("core/helper/action_errors.dart");
  const jobRoutes = readApi("clicks-customer-tech-api/src/routes/jobRoutes.js");
  const techRoutes = readApi("clicks-customer-tech-api/src/routes/technicianRoutes.js");

  step(
    "J-S1",
    "Home slide toggle → toggleOnlineStatus → PATCH /api/technicians/status",
    home.includes("SlideStatusToggle") &&
      cubit.includes("Future<void> toggleOnlineStatus()") &&
      cubit.includes("url: EndPoints.status") &&
      endPoints.includes('status = "/api/technicians/status"') &&
      techRoutes.includes('router.patch("/status"')
  );
  step(
    "J-S2",
    "Incoming assignment → banner/modal Accept → POST /technicians/jobs/:id/accept",
    mainShell.includes("IncomingJobTopBanner") &&
      mainShell.includes("IncomingJobModal") &&
      mainShell.includes("cubit.acceptJob()") &&
      cubit.includes("EndPoints.acceptJob(id)") &&
      techRoutes.includes('router.post("/jobs/:id/accept"')
  );
  step(
    "J-S3",
    "accepted → 'Start En Route' → startEnRoute → PATCH /jobs/:id/status en_route",
    active.includes("case 'accepted':") &&
      active.includes("cubit.startEnRoute") &&
      active.includes("'Start En Route'") &&
      cubit.includes("EndPoints.updateJobStatus(id)") &&
      cubit.includes("'job_status': 'en_route'") &&
      jobRoutes.includes('router.patch("/:id/status"')
  );
  step(
    "J-S4",
    "en_route → \"I've Arrived\" → markArrived → POST /jobs/:id/arrive",
    active.includes("case 'en_route':") &&
      active.includes("cubit.markArrived") &&
      cubit.includes("EndPoints.markArrived(id)") &&
      jobRoutes.includes('router.post("/:id/arrive"')
  );
  step(
    "J-S5",
    "arrived → 'Start Job' gated by 200m proximity (own job bypass) → POST /jobs/:id/start with GPS",
    active.includes("case 'arrived':") &&
      active.includes("cubit.canStartJob") &&
      active.includes("HomeCubit.startMaxMeters") &&
      active.includes("isOwnCreatedJob") &&
      cubit.includes("static const double startMaxMeters = 200") &&
      cubit.includes("EndPoints.startJob(id)") &&
      cubit.includes("'latitude': lat") &&
      jobRoutes.includes('router.post("/:id/start"')
  );
  step(
    "J-S6",
    "in_progress unpaid → 'Collect Payment' sheet (cash/card/wallet/fawran) → POST /jobs/:id/payment",
    active.includes("case 'in_progress':") &&
      active.includes("'Collect Payment'") &&
      active.includes("('cash', 'Cash')") &&
      active.includes("('fawran', 'Fawran')") &&
      cubit.includes("EndPoints.confirmPayment(id)") &&
      cubit.includes("'payment_method': paymentMethod") &&
      jobRoutes.includes('router.post("/:id/payment"')
  );
  step(
    "J-S7",
    "Repairs → addRepairProcedure → POST /jobs/:id/repairs; total → GET /jobs/:id/total",
    cubit.includes("EndPoints.addRepair(id)") &&
      cubit.includes("EndPoints.jobTotal(id)") &&
      jobRoutes.includes('router.post("/:id/repairs"') &&
      jobRoutes.includes('router.get("/:id/total"')
  );
  step(
    "J-S8",
    "Customer signature → multipart 'signature' → POST /jobs/:id/signature",
    cubit.includes("EndPoints.uploadSignature(id)") &&
      cubit.includes("'signature': MultipartFile") &&
      complete.includes("Collect customer signature") &&
      jobRoutes.includes("/:id/signature")
  );
  step(
    "J-S9",
    "in_progress paid → 'Complete Job' sheet requires Job ID + signature + payment → POST /jobs/:id/complete",
    active.includes("'Complete Job'") &&
      active.includes("_openComplete(context)") &&
      complete.includes("'Job ID is required'") &&
      complete.includes("'Customer signature is required'") &&
      actionErrors.includes("Collect payment before completing the job") &&
      cubit.includes("EndPoints.completeJob(id)") &&
      cubit.includes("'job_reference': reference") &&
      cubit.includes("'completion_notes': notes") &&
      jobRoutes.includes('router.post("/:id/complete"')
  );
  step(
    "J-S10",
    "Complete success clears activeJob and refreshes history + home meta",
    cubit.includes("optimisticStatus: 'completed'") &&
      /activeJob = null;\s*(_focusedJobId = null;\s*)?fetchHistory\(\);\s*fetchHomeMeta\(\);/.test(cubit)
  );
  step(
    "J-S11",
    "Activity details → receipt (InvoiceScreen) via GET /api/receipts/job/:id",
    activityDetails.includes("InvoiceScreen") &&
      endPoints.includes('receiptByJob(String id) => "/api/receipts/job/$id"')
  );
  step(
    "J-S12",
    "Offline blocked while on fulfill path (client guard + API M10)",
    cubit.includes("Finish your active job before going Offline") &&
      cubit.includes("bool get canToggleOnlineStatus") &&
      home.includes("enabled: cubit.canToggleOnlineStatus")
  );
  // Regression guard: ActiveJobScreen is a pushed route, so it must subscribe
  // to the cubit itself (BlocConsumer/BlocBuilder with bloc: cubit). Without
  // it, Start En Route / Arrived / Start Job succeed on the API but the sheet
  // never updates and the next tap hits "Cannot start en route from status".
  const openActiveJob = read("features/home/ui/view/open_active_job_screen.dart");
  step(
    "J-S13",
    "ActiveJobScreen (pushed route) rebuilds on cubit state (BlocConsumer bloc: cubit)",
    openActiveJob.includes("ActiveJobScreen(cubit: cubit)") &&
      /Bloc(Consumer|Builder)<HomeCubit, HomeState>\(\s*bloc: cubit/.test(active) &&
      active.includes("_buildScreen(context)")
  );
  // Regression guard: with 2+ jobs, the session poll must keep the job the
  // technician opened instead of swapping to the server's priority pick.
  step(
    "J-S14",
    "Session refresh keeps the focused job (_focusedJobId) instead of server priority",
    cubit.includes("String? _focusedJobId;") &&
      cubit.includes("_findQueuedJob(_focusedJobId)") &&
      /_focusedJobId = jobId;[\s\S]*_emitLoaded\(\);\s*return true;/.test(cubit) &&
      /activeJob = null;\s*_focusedJobId = null;\s*fetchHistory\(\);\s*fetchHomeMeta\(\);/.test(cubit)
  );
}

// ---------------------------------------------------------------------------
// Part 2 — live journey (mirrors the app's calls)
// ---------------------------------------------------------------------------
async function json(method, url, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body != null) {
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
const errOf = (r) => `${r.status} ${r.data?.error || r.data?.message || ""}`.trim();

async function loginTech() {
  const r = await json("POST", `${TECH_URL}/api/technicians/login`, {
    body: { phone: TECH_PHONE, password: TECH_PASSWORD },
  });
  if (r.status !== 200 || !r.data?.token) throw new Error(`Tech login failed (${errOf(r)})`);
  return {
    token: r.data.token,
    techId: String(r.data.technician?.id || r.data.technician?._id || r.data.id || ""),
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
async function findSourceId(adminToken) {
  const r = await json("GET", `${ADMIN_URL}/api/sources?limit=10`, { token: adminToken });
  const list = r.data?.sources || r.data?.data || r.data || [];
  const first = Array.isArray(list) ? list[0] : null;
  return first?._id || first?.id || null;
}
const getSession = (token) => json("GET", `${TECH_URL}/api/jobs/technician/session`, { token });
const findInSession = (session, id) =>
  (session.data?.active_jobs || []).find((j) => String(j._id) === String(id)) ||
  (String(session.data?.active_job?._id) === String(id) ? session.data.active_job : null);

/** Finish or cancel whatever is active so the journey starts from idle. */
async function preflightCleanup(techToken) {
  const session = await getSession(techToken);
  const jobs = session.data?.active_jobs || [];
  let cleaned = 0;
  for (const job of jobs) {
    console.log(`      preflight: ${job._id} ${job.job_status}/${job.payment_status || "-"} ${(job.clientName || "").slice(0, 28)}`);
    // Only touch jobs QA tooling created ("QA ..." client names) — the
    // production account can carry real dispatch jobs.
    if (!/^QA\b/i.test(String(job.clientName || ""))) continue;
    const id = job._id;
    const status = job.job_status;
    if (!id) continue;
    if (status === "in_progress") {
      if (job.payment_status !== "paid") {
        await json("POST", `${TECH_URL}/api/jobs/${id}/payment`, { token: techToken, body: { payment_method: "cash" } });
      }
      const form = new FormData();
      form.append("signature", new Blob([MIN_PNG], { type: "image/png" }), "sign.png");
      await json("POST", `${TECH_URL}/api/jobs/${id}/signature`, { token: techToken, form });
      await json("POST", `${TECH_URL}/api/jobs/${id}/complete`, {
        token: techToken,
        body: { completion_notes: "QA journey preflight", job_reference: "QA-JOURNEY-PREFLIGHT" },
      });
      cleaned++;
    } else if (status === "completed" && job.payment_status !== "paid") {
      await json("POST", `${TECH_URL}/api/jobs/${id}/payment`, { token: techToken, body: { payment_method: "cash" } });
      cleaned++;
    } else if (["accepted", "en_route", "arrived"].includes(status)) {
      await json("POST", `${TECH_URL}/api/jobs/${id}/cancel`, { token: techToken, body: { reason: "QA journey preflight" } });
      cleaned++;
    } else if (status === "assigned") {
      await json("POST", `${TECH_URL}/api/technicians/jobs/${id}/reject`, { token: techToken, body: { reason: "QA journey preflight" } });
      cleaned++;
    }
  }
  return { before: jobs.length, cleaned };
}

async function runLiveJourney() {
  console.log("\n--- Part 2: live journey on Railway (mirrors the app) ---");
  console.log(`Tech API:  ${TECH_URL}`);
  console.log(`Admin API: ${ADMIN_URL}`);

  const { token: techToken, techId, name } = await loginTech();
  step("J-1", "Login (technician)", !!techToken && !!techId, `${name} ${techId}`);
  const adminToken = await loginAdmin();
  step("J-1", "Login (dispatch)", !!adminToken);

  const pre = await preflightCleanup(techToken);
  if (pre.cleaned) warn("J-0", "Preflight cleared leftover active jobs", `${pre.cleaned}/${pre.before}`);

  // Remember the technician's status so we can restore it at the end.
  let session = await getSession(techToken);
  const startStatus = session.data?.technician?.status || "Offline";

  // 1. Go Online (Home slide toggle)
  let r = await json("PATCH", `${TECH_URL}/api/technicians/status`, { token: techToken, body: { status: "Online" } });
  session = await getSession(techToken);
  step("J-2", "Go Online (slide toggle) → status Online in session", r.status === 200 && session.data?.technician?.status === "Online", `${r.status} status=${session.data?.technician?.status}`);

  // 2. Dispatch assigns a job → appears in session (incoming banner source)
  const sourceId = await findSourceId(adminToken);
  step("J-3", "Resolve dispatch source", !!sourceId, sourceId || "none");
  const when = new Date();
  when.setHours(when.getHours() + 1);
  r = await json("POST", `${ADMIN_URL}/api/jobs`, {
    token: adminToken,
    body: {
      clientName: "QA Journey Customer",
      clientMobileNumber: `+9745${String(Date.now()).slice(-7)}`,
      issue: "QA user journey — flat tire on the highway",
      location: `LatLng(${JOB_LAT}, ${JOB_LNG})`,
      dateTime: when.toISOString(),
      jobType: "Flat Tire",
      assignedTechnician: techId,
      price: 150,
      source: sourceId,
    },
  });
  const jobId = r.data?.job?._id || r.data?._id;
  step("J-3", "Dispatch assigns job to technician", (r.status === 201 || r.status === 200) && !!jobId, jobId || errOf(r));
  if (!jobId) return { jobId: null, ownJobId: null, startStatus, techToken };

  session = await getSession(techToken);
  let inSession = findInSession(session, jobId);
  step("J-4", "Assignment visible in session as 'assigned' (incoming banner data)", inSession?.job_status === "assigned", inSession?.job_status || "missing");
  step("J-4", "Assignment payload carries what the banner shows (issue, location, price)",
    !!inSession && !!inSession.issue && !!inSession.location && inSession.price != null,
    inSession ? `${inSession.issue?.slice(0, 30)} | ${inSession.location} | QAR ${inSession.price}` : "—");

  // 3. Accept
  r = await json("POST", `${TECH_URL}/api/technicians/jobs/${jobId}/accept`, { token: techToken, body: {} });
  step("J-5", "Accept incoming job → accepted", r.status === 200 && r.data?.job_status === "accepted", errOf(r) || r.data?.job_status);
  session = await getSession(techToken);
  step("J-5", "Session active_job is the accepted job (ActiveJobScreen source)", String(session.data?.active_job?._id) === String(jobId) && session.data?.active_job?.job_status === "accepted", session.data?.active_job?.job_status || "none");
  step("J-5", "Technician status becomes On Job", session.data?.technician?.status === "On Job", session.data?.technician?.status);

  // Guard: Offline blocked mid-journey (M10)
  r = await json("PATCH", `${TECH_URL}/api/technicians/status`, { token: techToken, body: { status: "Offline" } });
  step("J-6", "Go Offline blocked while job is active", r.status === 400, errOf(r));

  // Guard: cannot skip straight to arrived / start from accepted
  r = await json("POST", `${TECH_URL}/api/jobs/${jobId}/start`, { token: techToken, body: { latitude: NEAR_LAT, longitude: NEAR_LNG } });
  step("J-6", "Start Job rejected before arriving (status gate)", r.status === 400, errOf(r));

  // 4. Start En Route
  r = await json("PATCH", `${TECH_URL}/api/jobs/${jobId}/status`, { token: techToken, body: { job_status: "en_route" } });
  step("J-7", "'Start En Route' → en_route", r.status === 200, errOf(r));

  // 5. I've Arrived
  r = await json("POST", `${TECH_URL}/api/jobs/${jobId}/arrive`, { token: techToken, body: {} });
  step("J-8", "\"I've Arrived\" → arrived", r.status === 200, errOf(r));
  session = await getSession(techToken);
  step("J-8", "Session reflects arrived", findInSession(session, jobId)?.job_status === "arrived", findInSession(session, jobId)?.job_status || "missing");

  // 6. Start Job — proximity gates then success. Order matters: the far and
  //    no-GPS attempts must both be rejected before the near attempt succeeds;
  //    if the API wrongly starts the job without GPS, record it as a finding
  //    and skip the near attempt (the job is already in_progress).
  r = await json("POST", `${TECH_URL}/api/jobs/${jobId}/start`, { token: techToken, body: { latitude: FAR_LAT, longitude: FAR_LNG } });
  step("J-9", "Start Job >200m away rejected with distance", r.status === 400 && r.data?.distanceMeters > 200, `${errOf(r)} distance=${r.data?.distanceMeters}`);
  // No coordinates in the request: the API resolves the technician's stored
  // currentLocation (resolveTechLatLng) and still enforces the 200m rule, so a
  // 200 that reports distanceMeters is correct; 400 "location is required" is
  // correct when nothing is stored. Only a 200 with gpsSkipped (no distance)
  // would be a proximity bypass for a dispatch-assigned job.
  r = await json("POST", `${TECH_URL}/api/jobs/${jobId}/start`, { token: techToken, body: {} });
  const startedWithoutGps = r.status === 200;
  const enforcedViaStoredLocation =
    startedWithoutGps && r.data?.distanceMeters != null && r.data?.gpsSkipped !== true;
  step(
    "J-9",
    "Start Job with no GPS in request: proximity enforced via stored location, or rejected",
    r.status === 400 || enforcedViaStoredLocation,
    startedWithoutGps
      ? `200 via stored technician location — distance=${r.data?.distanceMeters}m gpsSkipped=${r.data?.gpsSkipped ?? false}`
      : errOf(r)
  );
  if (startedWithoutGps) {
    warn("J-9", "Start Job within 200m (explicit GPS) skipped", "job already in_progress via the stored-location start above");
  } else {
    r = await json("POST", `${TECH_URL}/api/jobs/${jobId}/start`, { token: techToken, body: { latitude: NEAR_LAT, longitude: NEAR_LNG } });
    step("J-9", "Start Job within 200m → in_progress", r.status === 200 && r.data?.job_status === "in_progress" && r.data?.distanceMeters <= 200, `${r.status} distance=${r.data?.distanceMeters}m`);
  }

  // 7. Repairs + total
  r = await json("POST", `${TECH_URL}/api/jobs/${jobId}/repairs`, {
    token: techToken,
    body: { description: "QA journey — tire patch", name: "Tire patch", price: 40, cost: 15, quantity: 1, notes: "QA" },
  });
  step("J-10", "Add repair line", r.status === 200 || r.status === 201, errOf(r));
  r = await json("GET", `${TECH_URL}/api/jobs/${jobId}/total`, { token: techToken });
  step("J-10", "Total includes base + repair", r.status === 200 && Number(r.data?.total) >= 190, `total=${r.data?.total} profit=${r.data?.profit}`);

  // 8. Complete gates before payment / signature / Job ID
  r = await json("POST", `${TECH_URL}/api/jobs/${jobId}/complete`, { token: techToken, body: { completion_notes: "QA", job_reference: "QA-J-1" } });
  step("J-11", "Complete rejected before payment", r.status === 400 && /payment/i.test(r.data?.error || ""), errOf(r));

  // 9. Collect Payment (card)
  r = await json("POST", `${TECH_URL}/api/jobs/${jobId}/payment`, { token: techToken, body: { payment_method: "card" } });
  step("J-12", "'Collect Payment' (card) → paid", r.status === 200 && r.data?.payment_status === "paid" && r.data?.payment_method === "card", `${r.status} ${r.data?.payment_status}/${r.data?.payment_method}`);
  session = await getSession(techToken);
  step("J-12", "Job stays in_progress + paid after payment (app shows 'Complete Job')", findInSession(session, jobId)?.job_status === "in_progress" && findInSession(session, jobId)?.payment_status === "paid", `${findInSession(session, jobId)?.job_status}/${findInSession(session, jobId)?.payment_status}`);

  r = await json("POST", `${TECH_URL}/api/jobs/${jobId}/complete`, { token: techToken, body: { completion_notes: "QA", job_reference: "QA-J-1" } });
  step("J-13", "Complete rejected before customer signature", r.status === 400 && /signature/i.test(r.data?.error || ""), errOf(r));

  // 10. Customer signature
  const form = new FormData();
  form.append("signature", new Blob([MIN_PNG], { type: "image/png" }), "signature.png");
  r = await json("POST", `${TECH_URL}/api/jobs/${jobId}/signature`, { token: techToken, form });
  step("J-14", "Collect customer signature (multipart)", r.status === 200 && !!(r.data?.customerSignatureUrl || r.data?.job?.customerSignatureUrl), errOf(r));

  // 11. Complete Job — Job ID gates
  r = await json("POST", `${TECH_URL}/api/jobs/${jobId}/complete`, { token: techToken, body: { completion_notes: "QA" } });
  step("J-15", "Complete rejected without Job ID (job_reference)", r.status === 400 && /job id/i.test(r.data?.error || ""), errOf(r));
  r = await json("POST", `${TECH_URL}/api/jobs/${jobId}/complete`, { token: techToken, body: { completion_notes: "QA", job_reference: "X".repeat(65) } });
  step("J-15", "Complete rejected with Job ID > 64 chars", r.status === 400, errOf(r));
  r = await json("POST", `${TECH_URL}/api/jobs/${jobId}/complete`, {
    token: techToken,
    body: { completion_notes: "QA journey complete — customer happy", job_reference: "QA-JOURNEY-001" },
  });
  step("J-16", "'Complete Job' → completed", r.status === 200 && (r.data?.job_status === "completed" || r.data?.job?.job_status === "completed"), errOf(r) || "completed");

  // 12. After completion — activity, receipt, session, earnings
  r = await json("GET", `${TECH_URL}/api/jobs/${jobId}/activity-detail`, { token: techToken });
  const det = r.data;
  step("J-17", "Activity details show completed + paid + repair + pricing",
    r.status === 200 && det?.job?.job_status === "completed" && det?.job?.payment_status === "paid" && Array.isArray(det?.repairs) && det.repairs.length >= 1 && det?.pricing?.profit != null,
    `status=${det?.job?.job_status} paid=${det?.job?.payment_status} repairs=${det?.repairs?.length} total=${det?.pricing?.total ?? det?.pricing?.finalPrice}`);
  step("J-17", "Completion notes + Job ID persisted", det?.job?.job_reference === "QA-JOURNEY-001" && /customer happy/.test(det?.job?.completion_notes || ""), `ref=${det?.job?.job_reference}`);
  r = await json("GET", `${TECH_URL}/api/receipts/job/${jobId}`, { token: techToken });
  if (r.status === 200) {
    const rc = r.data?.receipt || r.data;
    step("J-18", "Receipt available for completed job", true, `total=${rc?.total ?? rc?.totalAmount ?? rc?.amount ?? rc?.grand_total ?? "n/a"} keys=${Object.keys(rc || {}).slice(0, 6).join(",")}`);
  }
  else warn("J-18", "Receipt not available for completed job", errOf(r));
  session = await getSession(techToken);
  step("J-19", "Completed job leaves the active session", !findInSession(session, jobId), `active_jobs=${session.data?.active_jobs?.length ?? 0}`);
  step("J-19", "Technician back to Online after completing", session.data?.technician?.status === "Online", session.data?.technician?.status);
  r = await json("GET", `${TECH_URL}/api/technicians/jobs`, { token: techToken });
  const hist = (r.data?.jobs || []).find((j) => String(j._id) === String(jobId));
  step("J-20", "Activity list shows the job as completed", r.status === 200 && hist?.job_status === "completed", hist?.job_status || "missing");
  r = await json("GET", `${TECH_URL}/api/technicians/dashboard`, { token: techToken });
  step("J-21", "Dashboard loads after completion", r.status === 200, `${r.status}`);
  r = await json("GET", `${TECH_URL}/api/analytics/earnings`, { token: techToken });
  step("J-21", "Earnings analytics load after completion", r.status === 200, `${r.status}`);

  // 13. Own-job path (Add job → start without GPS → complete)
  let ownJobId = null;
  r = await json("POST", `${TECH_URL}/api/technicians/jobs`, {
    token: techToken,
    body: {
      clientName: "QA Journey Walk-in",
      clientMobileNumber: String(Date.now()).slice(-8),
      countryCode: "+974",
      vehicleMake: "Toyota",
      vehicleModel: "Camry",
      issue: "QA journey — walk-in battery",
      location: `LatLng(${JOB_LAT}, ${JOB_LNG})`,
      dateTime: new Date().toISOString(),
      jobType: "Battery Replacement",
      price: 120,
    },
  });
  ownJobId = r.data?.job?._id || r.data?.job?.id;
  step("J-22", "Add job (own) → accepted + auto-assigned", (r.status === 200 || r.status === 201) && !!ownJobId && r.data?.job?.job_status === "accepted", ownJobId || errOf(r));
  if (ownJobId) {
    r = await json("PATCH", `${TECH_URL}/api/jobs/${ownJobId}/status`, { token: techToken, body: { job_status: "en_route" } });
    step("J-23", "Own job → en_route", r.status === 200, errOf(r));
    r = await json("POST", `${TECH_URL}/api/jobs/${ownJobId}/arrive`, { token: techToken, body: {} });
    step("J-23", "Own job → arrived", r.status === 200, errOf(r));
    r = await json("POST", `${TECH_URL}/api/jobs/${ownJobId}/start`, { token: techToken, body: {} });
    step("J-23", "Own job starts without GPS (gpsSkipped)", r.status === 200 && r.data?.gpsSkipped === true, `${r.status} gpsSkipped=${r.data?.gpsSkipped}`);
    r = await json("POST", `${TECH_URL}/api/jobs/${ownJobId}/payment`, { token: techToken, body: { payment_method: "cash" } });
    step("J-24", "Own job payment (cash)", r.status === 200 && r.data?.payment_status === "paid", errOf(r));
    const form2 = new FormData();
    form2.append("signature", new Blob([MIN_PNG], { type: "image/png" }), "signature.png");
    r = await json("POST", `${TECH_URL}/api/jobs/${ownJobId}/signature`, { token: techToken, form: form2 });
    step("J-24", "Own job signature", r.status === 200, errOf(r));
    r = await json("POST", `${TECH_URL}/api/jobs/${ownJobId}/complete`, { token: techToken, body: { completion_notes: "QA own job", job_reference: "QA-JOURNEY-OWN" } });
    step("J-25", "Own job → completed", r.status === 200, errOf(r));
  }

  // 14. Go Offline now that nothing is active; then restore original status.
  session = await getSession(techToken);
  r = await json("PATCH", `${TECH_URL}/api/technicians/status`, { token: techToken, body: { status: "Offline" } });
  step("J-26", "Go Offline allowed once no job is active", r.status === 200, `${errOf(r)} active_jobs=${session.data?.active_jobs?.length ?? 0}`);
  if (startStatus !== "Offline") {
    r = await json("PATCH", `${TECH_URL}/api/technicians/status`, { token: techToken, body: { status: "Online" } });
    step("J-26", `Restore technician status (${startStatus} → Online)`, r.status === 200, `${r.status}`);
  }

  return { jobId, ownJobId, startStatus, techToken };
}

async function main() {
  console.log("=== Technician User Journey QA (start job → complete job) ===");
  runStaticJourney();

  let live = null;
  if (SKIP_API) {
    console.log("\n(SKIP_API=1 — live journey not run)");
  } else {
    try {
      live = await runLiveJourney();
    } catch (e) {
      step("J-live", "Live journey aborted", false, e.message);
    }
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed, ${warned} warnings ===`);
  if (live?.jobId || live?.ownJobId) {
    console.log(`Completed QA jobs left in history (same convention as qa-tech-full-job.js): ${[live.jobId, live.ownJobId].filter(Boolean).join(", ")}`);
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("QA aborted:", err.message);
  process.exit(1);
});
