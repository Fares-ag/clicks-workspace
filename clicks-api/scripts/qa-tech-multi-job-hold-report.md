# QA Report: Technician Multi-Job and On-Hold (Admin-Only Hold)

**Date:** 2026-09-03  
**Scope:** M1–M10 (multi-job creation), H1–H7 (on-hold), OH-A1–A7 (admin hold/resume)  
**Automation:** `node scripts/qa-tech-multi-job-hold.js` · `npm test -- tests/integration/technician-multi-job-hold.integration.test.js`

---

## Executive summary

| Question | Answer |
|----------|--------|
| Can a technician create another job while on an active job? | **No** (API gate + UI `canShowAddJob`) until dispatch puts the current job **on hold**. |
| Can a technician hold or resume a job? | **No.** Admin only. Tech API hold/resume routes removed (404). Technician sees read-only `on_hold`. |
| What can they do when a job is on hold? | Add another job, go Offline, work the new job. Contact dispatch to resume the held job. |
| Garage scenario (2-day maintenance)? | Dispatch admin holds with reason → tech free for other jobs → admin resumes when ready. |

---

## Test execution (2026-09-03)

### Static UI / code checks — **14/14 PASS**

```powershell
$env:SKIP_API="1"; node scripts/qa-tech-multi-job-hold.js
```

| ID | Result | Finding |
|----|--------|---------|
| M2/M3 | PASS | ActiveJobScreen for blocking statuses; Add job gated on idle Home |
| M4 | PASS | Incoming `assigned` dispatch hides Add job |
| M7 | PASS | Activity → `continueJob` (no tech resume) |
| H1 | PASS | No Put on hold in technician app |
| H2 | PASS | No Cancel on active fulfill (by design) |
| H6/H7 | PASS | Live `on_hold` in schema; admin canonical status |
| OH-scope | PASS | MVP lists admin-only hold/resume |
| OH-UI | PASS | `on_hold` non-blocking; dispatch message on create gate; admin UI hold/resume |
| M10 | PASS | Offline blocked while active accepted job |

### API integration tests — **12/12 PASS**

```powershell
npm test -- tests/integration/technician-multi-job-hold.integration.test.js
```

| ID | Result | Finding |
|----|--------|---------|
| M1 | PASS | Create accepted job when no busy job |
| create gate | PASS | Second create blocked until admin hold |
| admin-only | PASS | Tech hold/resume → 404 |
| OH-A4 | PASS | Create allowed after admin hold |
| OH-A5 | PASS | Admin resume restores `status_before_hold` |
| M5/M6 | PASS | One `in_progress` at a time |
| M9 | PASS | Session `active_jobs` includes `on_hold`; sort prefers actionable |
| OH-5 | PASS | Start new job while another remains on hold |
| M10 | PASS | Offline blocked with active accepted job |
| H3/H5/H6 | PASS | completion_notes; arrived blocks offline; admin hold reason + GET fields |

### Live stack (Railway) — **WAIVED**

Default QA technician account returned **403 deactivated**. Live API matrix not run.

```bash
TECH_PHONE=... TECH_PASSWORD=... node scripts/qa-tech-multi-job-hold.js
```

---

## Product gaps

| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| **GAP-1** | Product | No on-hold workflow | **Closed** — admin hold/resume |
| **GAP-2** | Product | No technician cancel during active fulfill | **Open** — by design |
| **GAP-3** | UX | Add job during unaccepted dispatch | **Closed** — `hasIncomingAssignedJob` |
| **GAP-4** | Consistency | API allowed create during active job | **Closed** — create gate |
| **GAP-5** | UX | No follow-up job linkage | **Open** — post-MVP |

---

## Sign-off checklist

- [x] Multi-job + on-hold matrix automated locally
- [x] Admin-only hold/resume verified (tech 404)
- [x] Static UI confirms no tech hold actions
- [x] Integration + unit + regression green
- [ ] Live Railway re-run when QA technician account is active

See also: `scripts/qa-on-hold-feature-report.md` for full OH-1–OH-26 matrix.
