#!/usr/bin/env node
/**
 * QA: Alarm-stop-after-accept + offline-swipe device matrix (API side).
 *
 * Drives backend state for the Sep 8 fix QA. The human operator observes
 * device behaviour; this script creates/accepts/completes jobs and validates
 * API-level offline gates. Results feed the qa-tech-alarm-offline-report.md.
 *
 * Usage:
 *   node scripts/qa-alarm-offline-matrix.js
 *
 * Env: same as qa-tech-multi-job-hold.js
 */
const fs = require("fs");
const path = require("path");

const TECH_URL = (process.env.TECH_URL || "https://clicks-tech-api-production.up.railway.app").replace(/\/$/, "");
const ADMIN_URL = (process.env.ADMIN_URL || "https://clicks-admin-api-production.up.railway.app").replace(/\/$/, "");
const TECH_PHONE = process.env.TECH_PHONE || "+97411111111";
const TECH_PASSWORD = process.env.TECH_PASSWORD || "Tech123!";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@clicks.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin123!";

let passed = 0, failed = 0, warned = 0;
const results = [];

function step(id, desc, ok, detail = "") {
  const mark = ok === null ? "SKIP" : ok ? "PASS" : "FAIL";
  const line = `${mark}  [${id}] ${desc}${detail ? ` — ${detail}` : ""}`;
  console.log(line);
  results.push({ id, desc, ok, detail, mark });
  if (ok === true) passed++;
  else if (ok === false) failed++;
  return ok;
}
function warn(id, desc, detail = "") {
  console.log(`WARN  [${id}] ${desc}${detail ? ` — ${detail}` : ""}`);
  results.push({ id, desc, ok: null, detail, mark: "WARN" });
  warned++;
}
function section(title) {
  console.log(`\n${"=".repeat(60)}\n${title}\n${"=".repeat(60)}`);
}
function pause(label) {
  console.log(`\n>>> DEVICE CHECK: ${label}`);
  console.log("    Press ENTER when observed (or note result above)...");
}

async function json(method, url, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body != null) headers["Content-Type"] = "application/json";
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 200) }; }
  return { status: res.status, data };
}

async function loginTech() {
  const r = await json("POST", `${TECH_URL}/api/technicians/login`, { body: { phone: TECH_PHONE, password: TECH_PASSWORD } });
  if (r.status !== 200 || !r.data?.token) throw new Error(`Tech login failed (${r.status})`);
  return { token: r.data.token, techId: r.data.technician?.id || r.data.technician?._id };
}
async function loginAdmin() {
  const r = await json("POST", `${ADMIN_URL}/api/auth/login`, { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  const token = r.data?.accessToken || r.data?.token;
  if (r.status !== 200 || !token) throw new Error(`Admin login failed (${r.status}): ${r.data?.error || "no token"}`);
  return token;
}

async function getDispatchSourceId(adminToken) {
  const r = await json("GET", `${ADMIN_URL}/api/sources`, { token: adminToken });
  if (r.status !== 200) throw new Error("Could not list sources");
  const sources = r.data?.sources || r.data || [];
  const src = sources[0];
  if (!src?._id) throw new Error("No dispatch source found");
  return src._id.toString();
}

async function adminAssignJob(adminToken, techId, sourceId, label = "QA Alarm Test") {
  const when = new Date();
  when.setHours(when.getHours() + 1);
  const r = await json("POST", `${ADMIN_URL}/api/jobs`, {
    token: adminToken,
    body: {
      clientName: label,
      clientMobileNumber: `+9745${String(Date.now()).slice(-7)}`,
      issue: "QA alarm/offline matrix test",
      location: `LatLng(25.3269467, 51.4883967)`,
      dateTime: when.toISOString(),
      jobType: "Flat Tire",
      price: 100,
      assignedTechnician: techId,
      source: sourceId,
    },
  });
  const jobId = r.data?.job?._id?.toString() || r.data?._id?.toString();
  return { r, jobId };
}

async function techAcceptJob(techToken, jobId) {
  return json("POST", `${TECH_URL}/api/technicians/jobs/${jobId}/accept`, { token: techToken });
}
async function adminHoldJob(adminToken, jobId, reason = "QA hold") {
  return json("POST", `${ADMIN_URL}/api/jobs/${jobId}/hold`, { token: adminToken, body: { reason } });
}
async function techGoOnline(techToken) {
  return json("PATCH", `${TECH_URL}/api/technicians/status`, { token: techToken, body: { status: "Online" } });
}
async function techGoOffline(techToken) {
  return json("PATCH", `${TECH_URL}/api/technicians/status`, { token: techToken, body: { status: "Offline" } });
}
async function getSession(techToken) {
  return json("GET", `${TECH_URL}/api/jobs/technician/session`, { token: techToken });
}
async function deleteJob(adminToken, jobId) {
  return json("DELETE", `${ADMIN_URL}/api/jobs/${jobId}`, { token: adminToken });
}
async function advanceToAccepted(techToken, jobId) {
  await techAcceptJob(techToken, jobId);
}
async function advanceToInProgress(techToken, jobId) {
  await json("PATCH", `${TECH_URL}/api/jobs/${jobId}/status`, { token: techToken, body: { status: "en_route" } });
  await json("POST", `${TECH_URL}/api/jobs/${jobId}/arrive`, { token: techToken });
  await json("POST", `${TECH_URL}/api/jobs/${jobId}/start`, { token: techToken, body: { latitude: 25.3269467, longitude: 51.4883967 } });
}
async function completeJobFull(techToken, jobId) {
  await json("POST", `${TECH_URL}/api/jobs/${jobId}/payment`, { token: techToken, body: { payment_method: "cash" } });
  const MIN_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  const form = new FormData();
  form.append("signature", new Blob([MIN_PNG], { type: "image/png" }), "sign.png");
  await fetch(`${TECH_URL}/api/jobs/${jobId}/signature`, { method: "POST", headers: { Authorization: `Bearer ${techToken}` }, body: form });
  await json("POST", `${TECH_URL}/api/jobs/${jobId}/complete`, { token: techToken, body: { notes: "QA complete", job_reference: "QA-AL-MATRIX" } });
}

async function cleanupSession(techToken, adminToken) {
  const sess = await getSession(techToken);
  const jobs = sess.data?.active_jobs || [];
  for (const j of jobs) {
    const id = (j._id || j.job_id)?.toString();
    if (!id) continue;
    const status = j.job_status || j.status;
    if (status === "on_hold") {
      await json("POST", `${ADMIN_URL}/api/jobs/${id}/resume`, { token: adminToken });
    }
    await deleteJob(adminToken, id).catch(() => {});
  }
  const active = sess.data?.active_job;
  if (active) {
    const id = (active._id || active.job_id)?.toString();
    if (id) await deleteJob(adminToken, id).catch(() => {});
  }
}

async function main() {
  console.log("=== QA: Alarm-stop + Offline-swipe Matrix (Sep 8 fix) ===");
  console.log(`Tech API:  ${TECH_URL}`);
  console.log(`Admin API: ${ADMIN_URL}`);
  console.log("\nPhase 0: Login + preflight cleanup");

  const { token: techToken, techId } = await loginTech();
  const adminToken = await loginAdmin();
  const sourceId = await getDispatchSourceId(adminToken);
  console.log(`Tech: ${techId}, Source: ${sourceId}`);

  await cleanupSession(techToken, adminToken);
  await techGoOnline(techToken);

  const createdIds = [];

  // ─────────────────────────────────────────────
  section("Phase 2: Alarm-stop tests (API side)");
  // ─────────────────────────────────────────────

  // AL-1/AL-2: Assign job → device should show banner + alarm → accept → alarm should stop
  console.log("\n[AL-1/AL-2] Assigning job A — watch device for banner + alarm within ~5s");
  const { r: r1, jobId: jobA } = await adminAssignJob(adminToken, techId, sourceId, "QA AL-1 Accept Test");
  step("AL-1/AL-2 api", "Admin job assigned successfully", !!(r1.status === 201 && jobA), jobA || `${r1.status}`);
  if (jobA) createdIds.push(jobA);

  if (jobA) {
    // Give device time to receive socket/FCM and show incoming banner
    await new Promise(r => setTimeout(r, 5000));

    // Accept via API (mirrors banner/modal Accept tap)
    const acceptR = await techAcceptJob(techToken, jobA);
    step("AL-1/AL-2 api", "Accept returns 200", acceptR.status === 200, `${acceptR.status}`);

    // After accept: session should show 'accepted', no more 'assigned'
    const sessAfterAccept = await getSession(techToken);
    const activeStatus = sessAfterAccept.data?.active_job?.job_status;
    const hasAssigned = (sessAfterAccept.data?.active_jobs || []).some(j => j.job_status === "assigned");
    step("AL-5", "Session after accept has no 'assigned' jobs (alarm must not restart on session poll)", !hasAssigned, `status=${activeStatus} assigned=${hasAssigned}`);

    pause("AL-1/AL-2 — Did alarm STOP within ~1s of accept? Is it still silent after 30s? [observe device]");

    // AL-5: Wait for the 25s session poll interval and check again
    console.log("   Waiting 30s for session poll cycle (AL-5)...");
    await new Promise(r => setTimeout(r, 30000));
    const sessAfterPoll = await getSession(techToken);
    const stillAssigned = (sessAfterPoll.data?.active_jobs || []).some(j => j.job_status === "assigned");
    step("AL-5", "Session poll after 30s still has no assigned jobs", !stillAssigned, `assigned=${stillAssigned}`);
    pause("AL-5 — Did alarm remain silent (no restart) after the 30s session poll? [observe device]");

    // AL-6: Re-assign same job after cancel → should alarm again (fresh dispatch)
    await deleteJob(adminToken, jobA);
    createdIds.splice(createdIds.indexOf(jobA), 1);
    const { r: r6, jobId: jobARe } = await adminAssignJob(adminToken, techId, sourceId, "QA AL-6 Re-assign Test");
    step("AL-6", "Re-assign (new job) triggers fresh API job", !!(r6.status === 201 && jobARe), jobARe || `${r6.status}`);
    if (jobARe) createdIds.push(jobARe);
    await new Promise(r => setTimeout(r, 5000));
    pause("AL-6 — Did the re-dispatch trigger the alarm AGAIN (fresh assignment)? [observe device]");
    if (jobARe) {
      await techAcceptJob(techToken, jobARe);
      await deleteJob(adminToken, jobARe).catch(() => {});
      createdIds.splice(createdIds.indexOf(jobARe), 1);
    }
  }

  // AL-3: Job A accepted + en_route; assign Job B → pending banner; accept B → alarm stops
  await cleanupSession(techToken, adminToken);
  await techGoOnline(techToken);

  const { r: rA3a, jobId: jobA3a } = await adminAssignJob(adminToken, techId, sourceId, "QA AL-3 Job-A");
  if (jobA3a) {
    createdIds.push(jobA3a);
    await techAcceptJob(techToken, jobA3a);
    await json("PATCH", `${TECH_URL}/api/jobs/${jobA3a}/status`, { token: techToken, body: { status: "en_route" } });

    // Now assign Job B while A is en_route
    console.log("\n[AL-3] Job A en_route. Assigning Job B — device should show pending-assignments banner + alarm");
    const { r: rA3b, jobId: jobA3b } = await adminAssignJob(adminToken, techId, sourceId, "QA AL-3 Job-B");
    step("AL-3 api", "Job B assigned while A en_route", !!(rA3b.status === 201 && jobA3b), jobA3b || `${rA3b.status}`);
    if (jobA3b) createdIds.push(jobA3b);

    await new Promise(r => setTimeout(r, 5000));
    pause("AL-3 — Is the pending-assignments banner visible + alarm playing? [observe device]");

    if (jobA3b) {
      // Accept B via API (mirrors acceptJobById path from pending banner)
      const acceptB = await techAcceptJob(techToken, jobA3b);
      step("AL-3 api", "Accept Job B returns 200", acceptB.status === 200, `${acceptB.status}`);
      const sessB = await getSession(techToken);
      const anyAssigned = (sessB.data?.active_jobs || []).some(j => j.job_status === "assigned");
      step("AL-3", "No assigned jobs remain after accepting B", !anyAssigned, `assigned=${anyAssigned}`);
      await new Promise(r => setTimeout(r, 2000));
      pause("AL-3 — Did alarm STOP after accepting Job B? [observe device]");
      await deleteJob(adminToken, jobA3b).catch(() => {});
      createdIds.splice(createdIds.indexOf(jobA3b), 1);
    }
    await deleteJob(adminToken, jobA3a).catch(() => {});
    createdIds.splice(createdIds.indexOf(jobA3a), 1);
  }

  // ─────────────────────────────────────────────
  section("Phase 3: Offline-swipe tests (API side)");
  // ─────────────────────────────────────────────

  await cleanupSession(techToken, adminToken);
  await techGoOnline(techToken);

  // OFF-1: Assigned job → slider must be disabled on device
  console.log("\n[OFF-1] Assigning job — device slider should be disabled with hint");
  const { r: rOff1, jobId: offJob1 } = await adminAssignJob(adminToken, techId, sourceId, "QA OFF-1 Assigned");
  step("OFF-1 api", "Job assigned for OFF-1", !!(rOff1.status === 201 && offJob1), offJob1 || `${rOff1.status}`);
  if (offJob1) createdIds.push(offJob1);
  await new Promise(r => setTimeout(r, 4000));
  pause("OFF-1 — Is offline slider DISABLED + hint 'Accept pending job assignments before going offline' visible? [observe device]");

  if (offJob1) {
    await techAcceptJob(techToken, offJob1);
    // OFF-2: Accepted job → slider disabled, different hint
    await new Promise(r => setTimeout(r, 2000));
    pause("OFF-2 — With job ACCEPTED: is slider still DISABLED + hint 'Finish your active job before going offline'? [observe device]");

    // OFF-8: API offline attempt with active job → 400
    const offlineBlocked = await techGoOffline(techToken);
    step("OFF-8", "API blocks offline with active accepted job", offlineBlocked.status === 400 && /Cannot go Offline/i.test(offlineBlocked.data?.error || ""), offlineBlocked.data?.error || `${offlineBlocked.status}`);

    // OFF-4: Accept B while A active → slider still blocked (B is now accepted not assigned, but A is also active)
    const { r: rOff4b, jobId: offJob4b } = await adminAssignJob(adminToken, techId, sourceId, "QA OFF-4 Job-B");
    if (offJob4b) {
      createdIds.push(offJob4b);
      await new Promise(r => setTimeout(r, 4000));
      pause("OFF-4 — Job A accepted, Job B assigned in queue: is slider DISABLED + hint mentions pending assignments? [observe device]");
      // Accept B via API
      await techAcceptJob(techToken, offJob4b);
      await new Promise(r => setTimeout(r, 2000));
      // OFF-4 api: slider should still be blocked (both jobs accepted now → fulfillJob check)
      const offlineStillBlocked = await techGoOffline(techToken);
      step("OFF-4", "API blocks offline with 2 accepted jobs", offlineStillBlocked.status === 400, offlineStillBlocked.data?.error || `${offlineStillBlocked.status}`);
      await deleteJob(adminToken, offJob4b).catch(() => {});
      createdIds.splice(createdIds.indexOf(offJob4b), 1);
    }

    // OFF-5: Focus bug — hold job A, accept job B, then focus job A (on_hold) via Activity → Continue
    // set job A to on_hold and create a new accepted job B
    const holdResult = await adminHoldJob(adminToken, offJob1, "QA OFF-5 focus bug test");
    step("OFF-5 api", "Admin holds Job A → on_hold", holdResult.status === 200 && holdResult.data?.job?.job_status === "on_hold", holdResult.data?.job?.job_status || `${holdResult.status}`);

    const { r: rOff5b, jobId: offJob5b } = await adminAssignJob(adminToken, techId, sourceId, "QA OFF-5 Job-B");
    if (offJob5b) {
      createdIds.push(offJob5b);
      await techAcceptJob(techToken, offJob5b);
      await new Promise(r => setTimeout(r, 3000));
      console.log("   [OFF-5] Instruction: On device, go to Activity tab → tap on Job A (on_hold) → Continue. Then go to Home tab.");
      pause("OFF-5 — After focusing on_hold Job A with Job B accepted in queue: is slider DISABLED? (old bug: slider was enabled) [observe device]");

      // API sanity: offline should still be 400 (server checks all jobs)
      const offlineOff5 = await techGoOffline(techToken);
      step("OFF-5", "API still blocks offline (Job B is accepted)", offlineOff5.status === 400, offlineOff5.data?.error || `${offlineOff5.status}`);
      await deleteJob(adminToken, offJob5b).catch(() => {});
      createdIds.splice(createdIds.indexOf(offJob5b), 1);
    }

    // OFF-3: Only job is on_hold → slider should be ENABLED
    // Job A is on_hold now, Job B was just deleted
    await new Promise(r => setTimeout(r, 2000));
    pause("OFF-3 — Only job is on_hold: is slider ENABLED (not blocked)? Swipe to offline. [observe device]");
    const offlineAllowed = await techGoOffline(techToken);
    step("OFF-3", "API allows offline when only job is on_hold", offlineAllowed.status === 200, offlineAllowed.data?.error || offlineAllowed.data?.message || `${offlineAllowed.status}`);
    // Resume and go online for cleanup
    await json("POST", `${ADMIN_URL}/api/jobs/${offJob1}/resume`, { token: adminToken });
    await techGoOnline(techToken);
    await deleteJob(adminToken, offJob1).catch(() => {});
    createdIds.splice(createdIds.indexOf(offJob1), 1);
  }

  // OFF-7: No active jobs → slide to offline should succeed
  await cleanupSession(techToken, adminToken);
  await techGoOnline(techToken);
  const sessClean = await getSession(techToken);
  const cleanJobCount = (sessClean.data?.active_jobs || []).length;
  step("OFF-7 api", "Session has no active jobs for clean offline test", cleanJobCount === 0, `active_jobs=${cleanJobCount}`);
  pause("OFF-7 — With no active jobs: swipe slider to Offline. Did it succeed? [observe device]");
  const offlineClean = await techGoOffline(techToken);
  step("OFF-7", "API allows offline with no active jobs", offlineClean.status === 200, offlineClean.data?.error || offlineClean.data?.message || `${offlineClean.status}`);
  await techGoOnline(techToken);

  // ─────────────────────────────────────────────────────
  section("Phase 4: Regression subset (R-1, R-2, R-3 API)");
  // ─────────────────────────────────────────────────────

  // R-1/R-2: Assign job → banner should appear within 5s + alarm
  const { r: rR, jobId: rJob } = await adminAssignJob(adminToken, techId, sourceId, "QA R1 Regression");
  step("R-1/R-2 api", "Assign job for regression check", !!(rR.status === 201 && rJob), rJob || `${rR.status}`);
  if (rJob) createdIds.push(rJob);
  await new Promise(r => setTimeout(r, 5000));
  pause("R-1 — Is incoming banner/modal visible? R-2 — Is alarm audible BEFORE accept? [observe device]");

  // R-3: Accept R-Job, then assign another → check both can be accepted (MA1)
  if (rJob) {
    await techAcceptJob(techToken, rJob);
    const { r: rR3b, jobId: rJobB } = await adminAssignJob(adminToken, techId, sourceId, "QA R3 MA1 Job-B");
    if (rJobB) {
      createdIds.push(rJobB);
      await new Promise(r => setTimeout(r, 4000));
      const acceptB = await techAcceptJob(techToken, rJobB);
      const sessR3 = await getSession(techToken);
      const statuses = Object.fromEntries((sessR3.data?.active_jobs || []).map(j => [(j._id || j.job_id).toString(), j.job_status]));
      step("R-3", "Both jobs accepted (MA1 multi-accept)", acceptB.status === 200 && Object.values(statuses).every(s => s === "accepted"), JSON.stringify(statuses));
      pause("R-3 — Activity tab: are both jobs visible as accepted? [observe device]");
      await deleteJob(adminToken, rJobB).catch(() => {});
      createdIds.splice(createdIds.indexOf(rJobB), 1);
    }
    await deleteJob(adminToken, rJob).catch(() => {});
    createdIds.splice(createdIds.indexOf(rJob), 1);
  }

  // Final cleanup
  section("Cleanup");
  await cleanupSession(techToken, adminToken);
  for (const id of createdIds) {
    await deleteJob(adminToken, id).catch(() => {});
  }

  // Write results JSON
  const evidenceDir = path.join(__dirname, "scripts/qa-evidence/2026-09-08-technician-alarm-offline");
  fs.mkdirSync(evidenceDir, { recursive: true });
  const resultsPath = path.join(evidenceDir, "matrix-results.json");
  fs.writeFileSync(resultsPath, JSON.stringify({ ran: new Date().toISOString(), passed, failed, warned, results }, null, 2));
  console.log(`\nResults written to: ${resultsPath}`);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`=== Results: ${passed} passed, ${failed} failed, ${warned} warnings ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
