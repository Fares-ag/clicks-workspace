# QA Report: Technician Multi-Job, Home Nav, and Hold Request Approval

**Date:** 2026-09-03 (full run: local baseline + live Railway smoke)  
**Scope:** M1–M10 (unlimited multi-job), H1–H7 (on-hold), OH-A1–A6 (admin hold/resume), HR1–HR3 (hold request approval), add-job intake, full job lifecycle, intensive technician matrix, push/background alert server chain  
**Automation:** `node scripts/qa-tech-multi-job-hold.js` · `npm test -- tests/integration/technician-multi-job-hold.integration.test.js` · `qa-tech-add-job.js` · `qa-tech-full-job.js` · `qa-tech-intensive.js` · `qa-tech-push-notification.js` · `qa-tech-background-alert.js`

## Environment

| Layer | Target | Notes |
|-------|--------|-------|
| Local static | `clicks-technician/lib`, `clicks-interface`, `clicks-admin`, `clicks-shared` | `SKIP_API=1` |
| Local integration | Jest + `mongodb-memory-server` | in-memory Mongo, both APIs via supertest |
| Live tech API | `https://clicks-tech-api-production.up.railway.app` | `/api/health` → `{"status":"ok","db":"up"}` |
| Live admin API | `https://clicks-admin-api-production.up.railway.app` | `/api/health` → `{"status":"ok","db":"up"}` |
| Live accounts | Tech `+97411111111` (Omar Al-Thani), admin `admin@clicks.local` | **Both active** — login 200, no deactivation block |
| Phase C | Atlas `clicks` DB via `clicks-admin-api/.env`, Firebase admin JSON in `clicks-technician/assets/` | Mongo ping OK; service account present |

---

## Executive summary

| Question | Answer | Evidence |
|----------|--------|----------|
| Can a technician create another job while on an active job? | **Yes** — no API or UI create gate. | Static M4, integration `create allowed while active`, live OH-A3/OH-A4 (201) |
| Can a technician start multiple jobs in progress? | **Yes** — no single-`in_progress` cap. | Integration M5/M6, live M5 (A + B both `in_progress`) |
| Does Home tab show the active job map? | **No** — Home always shows idle hero; jobs open via pushed `ActiveJobScreen`. | Static M2/M3, M7 |
| Can a technician put a job on hold directly? | **No** — they **request** hold with a reason; job stays active until dispatch approves. | Static H1, live OH-A0 (tech `/hold` → 404), live HR1 (pending → approve → `on_hold`) |
| Can dispatch approve/reject hold requests? | **Yes** — admin web (`JobDetails`) and admin mobile (`job_detail_screen`). | Static OH-UI/HR-UI, live HR1/HR2/HR3 |
| Offline rules | Blocked while any accepted / en_route / arrived / in_progress job exists; allowed when the only job is `on_hold`. | Integration M10/H5, live M10, OH-3, H5 |

---

## Phase A — Local baseline

### A1. Static UI / code checks — **18/18 PASS** (no regression vs prior 18/18)

```powershell
$env:SKIP_API="1"; node scripts/qa-tech-multi-job-hold.js
```

| ID | Result | Finding |
|----|--------|---------|
| M2/M3 | PASS | Home always idle hero; active job via `openActiveJobScreen` push |
| M2/M3 | PASS | Add job when online (`canShowAddJob => isOnline`) |
| M4 | PASS | No create gate / hold-before-add message in cubit |
| M7 | PASS | Activity → `continueJob` + `openActiveJobScreen` |
| H1 | PASS | Request hold UI + API; no direct Put on hold |
| H2 | PASS | No Cancel on active fulfill (by design, GAP-2) |
| H6/H7 | PASS | `hold_request` subdocument; admin canonical `on_hold` |
| OH-UI | PASS | Shared `requestJobHold` / approve / reject; API routes |
| OH-UI | PASS | Admin web hold/resume + hold request approve/reject |
| HR-UI | PASS | Admin mobile hold request + Put on hold / Resume |
| HR-UI | PASS | Product rules: request hold → dispatch approves |
| M10 | PASS | Offline blocked while active fulfill job |

### A2. API integration tests (in-memory Mongo) — **15/15 PASS** (no regression vs prior 15/15)

```powershell
npm test -- tests/integration/technician-multi-job-hold.integration.test.js
```

| ID | Result | Finding |
|----|--------|---------|
| M1 | PASS | Create accepted job |
| create | PASS | Second create allowed while first accepted |
| admin-only | PASS | Tech direct hold/resume → 404 |
| OH-A4 | PASS | Create allowed after admin hold |
| OH-A5 | PASS | Admin hold from `in_progress`; resume restores prior status |
| M5/M6 | PASS | Multiple `in_progress` jobs allowed; complete one, continue other |
| M9 | PASS | Session `active_jobs` includes `on_hold` |
| OH-5 | PASS | Start new job while another remains `on_hold` |
| M10 | PASS | Offline blocked with active accepted job |
| H3 | PASS | `completion_notes` stores garage deferral workaround |
| H5 | PASS | Job at `arrived` stays in session and blocks offline |
| H6 | PASS | Admin hold requires reason; GET returns hold fields; PUT `on_hold` rejected |
| HR1 | PASS | Hold request pending → admin approve → `on_hold` |
| HR2 | PASS | Admin reject keeps job on fulfill path |
| HR3 | PASS | Direct admin hold supersedes pending request |

---

## Phase B — Live Railway API smoke

Run order: add-job → full-job → multi-job/hold → intensive. First pass surfaced four failures; all four were **stale expectations in the QA scripts** (not product defects) and were patched in the scripts, then the three affected scripts were re-run. One remaining failure is environmental (no local Flutter web server).

### Summary

| # | Script | First pass | After script fix | Verdict |
|---|--------|-----------:|-----------------:|---------|
| 3 | `qa-tech-add-job.js` | 12 / 2 FAIL / 0 WARN | 30 / 0 / 0 WARN | **PASS** |
| 4 | `qa-tech-full-job.js` | 16 / 0 / 0 | — (no rerun needed) | **PASS** |
| 5 | `qa-tech-multi-job-hold.js` | 49 / 1 FAIL / 0 WARN | 50 / 0 / 0 WARN | **PASS** |
| 6 | `qa-tech-intensive.js` | 67 / 2 FAIL / 0 WARN | 68 / 1 (ENV) / 0 WARN | **PASS** (env caveat) |

### B3. Add job intake — `qa-tech-add-job.js`

First-pass failures:

| Check | HTTP / detail | Root cause | Action |
|-------|---------------|------------|--------|
| `Add job gated by blocking fulfill / incoming dispatch` (static) | expected `JobFulfillStatus.isBlocking` in `home_screen.dart` | Gate was intentionally removed (GAP-4 closed; M4 asserts the opposite) | Script assertion inverted: now asserts `canShowAddJob => isOnline` and **no** blocking gate |
| `create technician job` | `400 {"error":"Invalid jobType"}` | Script sent legacy `"Flat tire"`; tech create accepts canonical `JOB_TYPES` only since the 16-type catalog (fda55f1) | Script payload → `"Flat Tire"` |

The create failure short-circuited the dependent checks (auto-assign, `accepted` status, creator stamp, source, coordinates, session, admin visibility, own-job en_route/arrive/start-without-GPS, cleanup). All exercised on the rerun.

Rerun — 30 / 0 / 0 WARN:

| Check | Result | Detail |
|-------|--------|--------|
| home_screen navigates to AddJobScreen | PASS |  |
| Add job shown when online; no blocking fulfill gate (multi-job) | PASS |  |
| add job only on idle Home (not Activity tab) | PASS | Activity tab has no create entry |
| add_job_screen calls createJobCard | PASS |  |
| createJobCard surfaces API errors | PASS |  |
| add_job uses vehicle catalog | PASS |  |
| technician login | PASS | Omar Al-Thani |
| vehicle makes catalog | PASS | count=170 |
| vehicle models for make | PASS | Toyota models=65 |
| create technician job | PASS | 6a99d624c208012f80bb5c54 |
| job auto-assigned to creator | PASS | 6a5ea3b97c12fea43f51ed4f |
| job status accepted (ready to start) | PASS | accepted |
| job stamped with creator | PASS | Omar Al-Thani |
| Technician App source | PASS | Technician App |
| location coordinates parsed | PASS | [51.4883967,25.3269467] |
| job in technician session | PASS | accepted |
| reject missing clientName | PASS | status=400 |
| reject invalid phone | PASS | status=400 Phone number must be exactly 8 digits (without country code) |
| reject invalid jobType | PASS | status=400 |
| reject unauthenticated | PASS | status=401 |
| technician jobs list endpoint | PASS | jobs=20 |
| created job visible in activities list | PASS | 6a99d624c208012f80bb5c54 |
| admin login | PASS |  |
| admin can fetch created job | PASS | QA Add Job Customer |
| admin sees accepted status | PASS | accepted |
| admin sees assigned technician | PASS | Omar |
| own job en_route | PASS | status=200 |
| own job arrived | PASS | status=200 |
| own job start without GPS | PASS | gpsSkipped=true |
| cleanup test job | PASS | 6a99d624c208012f80bb5c54 |

### B4. Full job lifecycle — `qa-tech-full-job.js` — **16/16 PASS**

| Step | Result | Detail |
|------|--------|--------|
| technician login | PASS | (script prints `techId=undefined` — cosmetic, response uses `technician._id`) |
| preflight cleanup | PASS | Cancelled leftover `6a99d315bbd1e90965680b98` (`en_route`) from an earlier run |
| admin login / admin create assigned job | PASS | `6a99d474bbd1e909656812e2` |
| accept → en_route → arrived | PASS | 200 / 200 / 200 |
| start (proximity) | PASS | 61 m |
| customer signature / add repair / calculate total | PASS | total=200 profit=180 |
| reject complete before payment | PASS | 400 |
| confirm payment → complete | PASS | paid=paid, 200 |
| activity-detail / session cleared | PASS | repairs=1, active_jobs=1 (other QA job) |

### B5. Multi-job + hold request matrix — `qa-tech-multi-job-hold.js`

First pass: **49 PASS / 1 FAIL**. Static block 18/18 (same as A1) plus live API matrix:

| ID | Result | Finding |
|----|--------|---------|
| M1 | PASS | Create technician job (accepted, auto-assigned) |
| OH-A3 | PASS | Create second job while first accepted — 201 |
| OH-A0 | PASS | Technician `POST /hold` not available — 404 |
| OH-A2 | PASS | Admin hold without reason — 400 `Hold reason is required` |
| OH-A1 | PASS | Admin hold with reason → `on_hold` |
| OH-A6 | PASS | Admin GET includes `hold_reason` |
| OH-A4 | PASS | Create second job while first `on_hold` — 201 |
| M9 | PASS | Session lists held + accepted (count=3); prioritizes accepted over `on_hold` |
| OH-A5 | PASS | Admin resume restores `status_before_hold` (accepted) |
| M6 | PASS | Job A reaches `in_progress` after resume |
| M5 | PASS | Start Job B while A `in_progress` — 200; both `in_progress` concurrently |
| M6 | PASS | Complete A while B remains `in_progress` |
| HR1 | PASS | Tech hold-request leaves job on fulfill path (`pending`); duplicate → 409 |
| HR1 | PASS | Admin approve applies `on_hold` with tech reason |
| HR2 | PASS | Admin reject keeps job on fulfill path |
| HR3 | PASS | Direct admin hold supersedes pending request |
| M10 | PASS | API blocks Offline with active accepted job |
| OH-3 | PASS | Offline allowed when only job is `on_hold` |
| H3 | PASS | Complete with garage deferral note — 200; admin sees `completion_notes` |
| **H4** | **FAIL → fixed** | Admin follow-up create returned **400 `Missing required fields`** — script body omitted `source`, which shared `createJobRecord` requires. Script now resolves a source id like every other admin-create QA script. |
| H6 | PASS | Admin PUT `on_hold` rejected (400, use `POST /hold`); `POST /hold` with reason → `on_hold` |
| H5 | PASS | Job at `arrived` remains in `active_jobs`; Offline blocked |
| cleanup | PASS | 9 test jobs deleted |

Rerun — 50 / 0 / 0 WARN: all 50 checks PASS. H4 follow-up job created (`6a99d69bbbd1e90965682493`, unlinked — GAP-5 stands); cleanup deleted 10 test jobs.

### B6. Intensive technician QA — `qa-tech-intensive.js`

First pass: **67 PASS / 2 FAIL**.

| Area | Result | Detail |
|------|--------|--------|
| Frontend wiring (static) | 7/8 | Collect Payment CTA, fawran option, payment-before-complete gating, cubit keeps job after payment, signature-only complete sheet, earnings LayoutBuilder, background-location disclosure — PASS. **`add job RSA types present` FAIL → fixed**: `add_job_screen.dart` now imports `kJobTypes` from `core/constants/job_types.dart`; script checked for inline literals. Script now validates the catalog file (all 16 types present). |
| `local technician frontend up` | **FAIL (ENV)** | `fetch failed` — expects a local Flutter web server at `FRONTEND_URL` (default `http://localhost:8081`). Not running in this environment; not a product defect. |
| Auth & meta | 14/14 | login, admin login, profile, dashboard, session, analytics/earnings, analytics/performance, privacy-policy, faqs, terms, maps directions (unauth rejected / auth 200) |
| Reject / cancel flows | 5/5 | reject assigned; accept then cancel |
| Payment / complete gates | 8/8 | start too far → 400; start near (61 m); complete w/o signature/payment → 400; unpaid → 400; invalid payment_method handled; complete after pay+sign |
| Lifecycle × payment methods | 16/16 | cash, card, wallet, fawran — start / payment / complete / activity-detail |
| Tech create × 16 RSA types | 16/16 | Towing … Car Wash all 201 (cancelled after) |
| Final session | PASS | `active=0` |

Rerun — 68 / 1 (ENV) / 0 WARN: 68/69. `add job RSA types present` now PASS (16 types via `kJobTypes`); the only failure is `local technician frontend up` (ENV). Final session `active=0`.

---

## Phase C — Push / background alert (server-side)

Prerequisites were available locally (MONGODB_URI from `clicks-admin-api/.env`, Firebase admin JSON in `clicks-technician/assets/`), so both scripts ran against Railway. Server-side chain is green; **device delivery is unverifiable** because the QA technician record has no FCM token (the phone has not logged into the native app since the last token clear).

### C7. FCM chain — `qa-tech-push-notification.js` — **9 PASS / 0 FAIL / 3 WARN**

| Check | Result | Detail |
|-------|--------|--------|
| technician login | PASS | techId=6a5ea3b97c12fea43f51ed4f |
| admin login | PASS |  |
| resolve technician id | PASS | 6a5ea3b97c12fea43f51ed4f |
| read technician via admin API | PASS | Omar Al-Thani |
| technician has no FCM token in DB | WARN | Open the native app, log in, complete permission setup — then re-run |
| POST /api/technicians/fcm-token | PASS | skipped — set QA_OVERWRITE_FCM=1 to register test token |
| Firebase service account file found | PASS | clicks-technician-qa-firebase-adminsdk-fbsvc-fb47f37543.json |
| Firebase send | WARN | no token available to test delivery |
| resolve source id | PASS | 6a5ea166a67c3d98fc2e69fe |
| admin create job (triggers notify-technician) | PASS | jobId=6a99d7b7bbd1e90965682db2 status=201 |
| direct notify-technician | WARN | 401 — production internal secret differs (admin job create still notifies) |
| cleanup | PASS | reject QA job — 6a99d7b7bbd1e90965682db2 |

### C8. Background alert server proof — `qa-tech-background-alert.js` — **6 PASS / 0 FAIL / 3 WARN** (server phase; device matrix Tests A–E not run)

| Check | Result | Detail |
|-------|--------|--------|
| technician login | PASS | techId=6a5ea3b97c12fea43f51ed4f |
| read technician from MongoDB | PASS | Omar Al-Thani |
| technician FCM token | WARN | missing or placeholder — complete Phase 1 on native app first |
| Firebase service account file | PASS | clicks-technician-qa-firebase-adminsdk-fbsvc-fb47f37543.json project=clicks-technician-qa |
| local FIREBASE_SERVICE_ACCOUNT_JSON | WARN | not in .env — production Railway must have it for live pushes |
| Firebase send | WARN | skipped — no real token |
| admin login | PASS |  |
| admin create job (notify-technician path) | PASS | jobId=6a99d7c2bbd1e90965682e18 status=201 |
| cleanup QA job | PASS | 6a99d7c2bbd1e90965682e18 |

Results file: `scripts/qa-tech-background-alert-results.json` (hasRealToken=false, phase2FcmSend=false). Device checklist (Phase 1 preconditions, Tests A–E, logcat capture) printed by the script — see Phase D.

### Post-run orphan check

`GET /api/jobs/technician/session` after the whole chain: **session status=200 active_jobs=0** — no orphaned QA jobs on the technician account.

---

## Phase D — Manual device smoke — **MANUAL / NOT RUN**

Operator fills on phone; none of these were confirmed in this run.

- [ ] Home tab shows idle hero when online (active job opens via pushed ActiveJobScreen, not Home map)
- [ ] Go Online → Add job works while another job is active
- [ ] Accept incoming job → map screen pushes correctly
- [ ] Request hold shows reason sheet; job stays active until dispatch approves
- [ ] After admin approves hold: job shows on_hold; technician can add another job / go offline on other work
- [ ] Activity tab → Continue job opens ActiveJobScreen
- [ ] Offline blocked while active accepted/in-progress fulfill job (M10)
- [ ] Push notification received on device for urgent job (server chain PASS; device delivery not verified — no FCM token registered for the QA technician)

---

## Live Railway verdict

**PASS.** Both live accounts active (no 403/deactivation). All four technician scripts pass on Railway after the script-side fixes:

| Script | Result | Verdict |
|--------|--------|---------|
| add-job | 30 / 0 / 0 WARN | **PASS** |
| full-job | 16 / 0 / 0 | **PASS** |
| multi-job/hold | 50 / 0 / 0 WARN | **PASS** — OH-A3, M5, M9, M10, OH-3, H3–H6, HR1–HR3 all green live |
| intensive | 68 / 1 (ENV: local frontend) / 0 WARN | **PASS** — only `local technician frontend up` fails, environmental |
| push-notification (Phase C) | 9 / 0 / 3 WARN | **PASS (server)** — device delivery unverified |
| background-alert (Phase C) | 6 / 0 / 3 WARN | **PASS (server)** — device matrix not run |

No product regressions found versus the prior report (18/18 static, 15/15 integration both unchanged). Test jobs created live were deleted/cancelled/rejected by the scripts; post-run session shows zero active jobs.

---

## Product gaps & findings

| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| **GAP-2** | Product | No technician cancel during active fulfill (API exists; UI omitted per ProductRules) | **Open** — by design |
| **GAP-5** | UX | No follow-up job linkage after partial garage work (manual rebook only; H4 confirms admin can create an unlinked follow-up) | **Open** — post-MVP |
| **QA-1** | QA hygiene | Four QA-script assertions had drifted from shipped behaviour (add-job create gate, legacy `"Flat tire"` jobType, H4 missing `source`, RSA types moved to `job_types.dart`). Fixed in scripts this run (uncommitted). | **Fixed (scripts)** |
| **QA-2** | QA env | `qa-tech-intensive.js` `local technician frontend up` needs a local Flutter web server (`FRONTEND_URL`); fails as ENV otherwise. | **Open** — run with a local web build or downgrade to WARN |
| **QA-3** | QA hygiene | `qa-tech-full-job.js` prints `techId=undefined` at login (reads `technician.id`; API returns `technician._id`). Cosmetic. | **Open** — minor |
| **OBS-1** | Ops | Preflight found a leftover `en_route` QA job (`6a99d315bbd1e90965680b98`) from a prior run; cancelled by `qa-tech-full-job.js`. | Cleaned |
| **PUSH-1** | Device | Technician `+97411111111` has **no FCM token** in DB — Firebase send and device alert cannot be verified until the QA phone logs into the native app and registers a token. | **Open** — device step |
| **PUSH-2** | Env | Local `INTERNAL_API_SECRET` differs from production: direct `POST /api/sos/notify-technician` → 401 (expected); admin job create → notify path still returns 201. `FIREBASE_SERVICE_ACCOUNT_JSON` is not in local `.env` (Railway must carry it). | Informational |

**Closed since prior report:** GAP-3 (incoming hides add job — no longer required), GAP-4 (create gate removed).

---

## Sign-off checklist

- [x] Unlimited multi-job matrix automated locally (integration 15/15 + static 18/18)
- [x] Home nav decoupled from active job map (static QA)
- [x] Hold request approval flow (HR1–HR3 integration + static UI)
- [x] Admin web + mobile hold request UI (static QA)
- [x] Live Railway re-run with active QA technician account — add-job 30/30, multi-job/hold 50/50
- [x] Live full lifecycle (create → en_route → arrive → start → pay → complete) — 16/16
- [x] Live intensive matrix (auth, payments × 4 methods, 16 RSA types, maps) — 68/69 (local-frontend check is ENV)
- [x] Push / background-alert server chain (Firebase creds, admin create → notify) — 15 PASS, 0 FAIL, 6 WARN
- [ ] Device FCM delivery — blocked: no FCM token registered for the QA technician
- [ ] Manual device smoke: Home tab, Accept → map push, Request hold banner, Offline block, device push

See also: `scripts/qa-on-hold-feature-report.md` for legacy OH-1–OH-26 matrix context.
