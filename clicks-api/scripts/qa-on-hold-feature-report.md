# QA Report: Job On-Hold Feature (Admin-Only Hold/Resume)

**Date:** 2026-09-03  
**Tester:** automation (local Jest + static code scan)  
**Environment:** local `mongodb-memory-server`; static scan of technician app + admin portal  
**Scope:** Admin holds/resumes jobs; technicians see read-only `on_hold` status  

**Automation run:**

```bash
npm test -- tests/integration/technician-multi-job-hold.integration.test.js   # 12/12 pass
node --test clicks-shared/constants/jobStatuses.test.js clicks-shared/services/jobHold.test.js  # 11/11 pass
npm test -- tests/integration/job-lifecycle.integration.test.js               # 4/4 pass
$env:SKIP_API="1"; node scripts/qa-tech-multi-job-hold.js                     # 14/14 static pass
node scripts/qa-tech-multi-job-hold.js                                        # live API waived (403 deactivated tech)
```

---

## Executive summary

| Question | Answer |
|----------|--------|
| Who can hold or resume a job? | **Admin only** via admin API/UI (`POST /api/jobs/:id/hold` and `/resume`). Tech API routes removed; tech hold/resume returns **404**. |
| Can a technician create another job while on an active fulfill job? | **No**, until dispatch puts the current job on hold. API returns 400 with `blocking_job_id`. UI hides Add job via `canShowAddJob`. |
| What does the technician see when a job is on hold? | Read-only `on_hold` in session/Activity; idle Home shows “job on hold” chip; **no** Put on hold or Resume actions. |
| Does admin see the hold reason? | **Yes.** Job Details On Hold card, Jobs list truncated reason, dashboard `jobs.onHold` count (excluded from Ongoing). |

**GAP-1 (no on-hold workflow): closed.**  
**GAP-3 (Add job during assigned dispatch): closed** — `hasIncomingAssignedJob` hides Add job.  
**GAP-4 (API allowed create during active job): closed** — create gated on `TECH_BUSY_JOB_STATUSES`.  
**GAP-2** remains (no technician cancel on active fulfill — by design).  
**GAP-5** remains (no linked follow-up job after garage work).

---

## Test execution results (2026-09-03)

| Suite | Result | Notes |
|-------|--------|-------|
| Integration `technician-multi-job-hold` | **12/12 PASS** | Includes admin-only hold/resume; tech hold/resume 404; create gate; session sort; offline while held allowed |
| Unit `jobStatuses` + `jobHold` | **11/11 PASS** | Hold reason validation; `on_hold` not busy/offline-blocking |
| Regression `job-lifecycle` | **4/4 PASS** | Start proximity, payment/signature gates, complete path unchanged |
| Static UI/code (`SKIP_API=1`) | **14/14 PASS** | No Put on hold in tech app; admin hold/resume UI present; MVP scope admin-only |
| Live Railway API matrix | **WAIVED** | Default QA tech account returns **403 deactivated** |

---

## 6.1 Automation (OH-A1–A6)

Covered by `technician-multi-job-hold.integration.test.js` (local). Live script steps mirror these when credentials are active.

| ID | Check | Result | Evidence |
|----|-------|--------|----------|
| **OH-A1** | Admin hold with reason → 200, `job_status: on_hold` | **PASS** | Admin `POST /hold` with reason |
| **OH-A2** | Hold without reason → 400 | **PASS** | `"Hold reason is required"` |
| **OH-A3** | Create second job while first `accepted` → 400 | **PASS** | `"on hold before creating another"` + `blocking_job_id` |
| **OH-A4** | Create second job while first `on_hold` → 201 | **PASS** | Second job `accepted` |
| **OH-A5** | Admin resume restores `status_before_hold` | **PASS** | Resume restores prior status; `hold_reason` retained |
| **OH-A6** | Admin GET includes `hold_reason` | **PASS** | `hold_reason`, `on_hold_at`, `held_by: "admin"` |
| **OH-A7** | Tech `POST /hold` and `/resume` → 404 | **PASS** | Routes removed from tech API |

**Live Railway:** not run — re-enable QA technician account, then:

```bash
TECH_PHONE=... TECH_PASSWORD=... ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/qa-tech-multi-job-hold.js
```

---

## 6.2 Technician app (OH-1–OH-12)

No Flutter device in this environment. Results are **code + API verified**.

| ID | Expected | Result | How verified |
|----|----------|--------|--------------|
| **OH-1** | No hold reason sheet / submit in tech app | **PASS (code)** | No `putJobOnHold`, Put on hold, or hold sheet in technician lib |
| **OH-2** | After admin hold → idle Home; Add job visible | **PASS (API + code)** | Admin hold API 200; `JobFulfillStatus.isBlocking('on_hold')` false; `canShowAddJob` |
| **OH-3** | Go Offline while held | **PASS (API)** | Hold then `PATCH status Offline` → 200 |
| **OH-4** | Add job while held | **PASS (API)** | OH-A4 integration test |
| **OH-5** | Fulfill new job to `in_progress`; held job unchanged | **PASS (API)** | Dedicated integration test |
| **OH-6** | Activity shows on-hold read-only; no tech Resume | **PASS (code + API)** | Activity: “On hold — contact dispatch”; no `resumeHeldJob`; admin resume restores status |
| **OH-7** | Hold from `accepted` stores `status_before_hold: accepted` | **PASS (API)** | Create-after-hold test |
| **OH-8** | Hold from `en_route` | **PASS (code)** | `HOLDABLE_JOB_STATUSES` includes `en_route` |
| **OH-9** | Hold from `arrived` | **PASS (code)** | Same holdable list |
| **OH-10** | Incoming `assigned` hides Add job | **PASS (code)** | `canShowAddJob => !hasBlockingFulfillJob && !hasIncomingAssignedJob` |
| **OH-11** | Complete unpaid `in_progress` without hold | **PASS (API)** | H3 + `job-lifecycle.integration.test.js` |
| **OH-12** | Hold a paid job blocked | **PASS (API)** | `putJobOnHold` rejects `payment_status === "paid"` |

**Waiver:** OH-1–OH-12 on-device visual confirmation deferred to staging.

---

## 6.3 Admin portal (OH-13–OH-20)

No live admin browser session. Results are **code + API verified**.

| ID | Expected | Result | How verified |
|----|----------|--------|--------------|
| **OH-13** | Job Details On Hold section shows reason + metadata | **PASS (code + API)** | Details card; GET returns hold fields |
| **OH-14** | Jobs list `on_hold` pill + truncated reason | **PASS (code)** | `Jobs.jsx` |
| **OH-15** | Filter by On hold | **PASS (code)** | `JOB_STATUS_FILTER_KEYS` includes `on_hold` |
| **OH-16** | Dashboard On hold count; not in Ongoing | **PASS (code)** | `jobs.onHold`; `ONGOING_JOB_STATUSES` excludes `on_hold` |
| **OH-17** | Admin Put on hold → `held_by: admin` | **PASS (API)** | H6 admin `POST /hold` |
| **OH-18** | Admin Resume restores status; reason kept | **PASS (API)** | H6 resume path |
| **OH-19** | Reassign blocked while on hold | **PASS (code)** | Technician select disabled for `on_hold` |
| **OH-20** | Hold modal without reason blocked | **PASS (code)** | Confirm disabled when reason empty; PUT `job_status: on_hold` rejected |

**Waiver:** OH-13–OH-20 browser click-through deferred to staging.

---

## 6.4 Regression (OH-21–OH-26)

| ID | Area | Result | Notes |
|----|------|--------|-------|
| **OH-21** | Dispatch / start / pay / complete | **PASS** | `job-lifecycle.integration.test.js` |
| **OH-22** | Tech self-create without hold | **PASS** | M1 create `accepted` when no busy job |
| **OH-23** | One `in_progress` at a time | **PASS** | M5/M6 |
| **OH-24** | Admin cancel presence | **PASS (code)** | Uses `resolveTechnicianStatusAfterJob` |
| **OH-25** | Session includes held jobs; sort prefers actionable | **PASS (API)** | M9 |
| **OH-26** | Incoming assignment while only held | **PASS (code)** | Session sort ranks `assigned` above `on_hold` |

---

## Static UI / code matrix

**14/14 passed.** Logged product gap: **GAP-2** (no Cancel on ActiveJobScreen — by design).

Key admin-only checks:

- **H1 PASS:** No Put on hold action in technician app
- **M7 PASS:** Activity uses `continueJob`, not tech resume
- **OH-scope PASS:** MVP documents admin-only hold/resume

---

## Sign-off

| Criterion | Status |
|-----------|--------|
| Integration suite green (12 tests) | **Met** |
| Unit tests green (11 tests) | **Met** |
| Regression job-lifecycle green (4 tests) | **Met** |
| Static UI/code matrix (14 checks) | **Met** |
| Tech cannot hold/resume (404) | **Met** |
| Live Railway OH-A1–A6 | **Waived** — QA tech account deactivated |
| Manual device/browser OH-1–OH-20 | **Deferred to staging** |

**QA-approved for the automated contract (admin-only hold/resume).** Re-run live API matrix after reactivating the QA technician account on Railway.

### Known follow-ups (not P0)

- Optional: hide admin Put on hold when job is paid (API already blocks).
- Auto-linked garage return job still out of scope (GAP-5).
- Customer push on hold/resume out of scope.
