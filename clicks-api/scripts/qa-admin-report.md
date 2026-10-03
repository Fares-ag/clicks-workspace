# QA Report: Admin Portal (Web + Mobile) — RBAC, Hold/Resume, Leads, SOS, Business Popup, Finance, Field Locking

**Date:** 2026-09-03 (local baseline + live Railway smoke)  
**Scope:** Dispatcher RBAC (UI matrix, middleware, live 403/200), admin field locking (source-locked jobs, SOS cancel reason, partner period dates), hold/resume + hold-request approval (admin web `clicks-interface`, admin mobile `clicks-admin`), lead → job pipeline, job location links, business portal → admin socket popup, finance portal, admin location socket event  
**Automation:** `npm test -- tests/integration/{rbac,sos-e2e,finance-lock,technician-multi-job-hold}.integration.test.js` · `qa-dispatcher-rbac.js` · `qa-admin-field-locking.js` · `qa-admin-field-locking-integration.js` · `qa-tech-multi-job-hold.js` · `qa-leads.js` · `qa-job-location-links.js` · `qa-business-portal-admin-popup.js` · `qa-finance-users.js` · `qa-finance-portal.js` · `verify-admin-location-event.js`

## Environment

| Layer | Target | Notes |
|-------|--------|-------|
| Local static / unit | `clicks-interface/src`, `clicks-admin/lib`, `clicks-admin-api/src`, `clicks-shared` | no server needed |
| Local integration | Jest + `mongodb-memory-server` | admin-api + tech-api via supertest / socket.io-client |
| Live admin API | `https://clicks-admin-api-production.up.railway.app` | `/api/health` → `{"status":"ok","db":"up"}` |
| Live tech API | `https://clicks-tech-api-production.up.railway.app` | `/api/health` → `{"status":"ok","db":"up"}` |
| Live accounts | Super Admin `admin@clicks.local`, tech `+97411111111`, business `business@clicks.local`, customer `customer@clicks.local`, dispatcher `qa-job-dispatcher@clicks.local` (seeded by script if missing), finance `finance@clicks.local` | Admin login 200 — **not blocked** |
| DB access | `MONGODB_URI` from `clicks-admin-api/.env` (Atlas `clicks`) | Same database Railway serves (live job ids resolve locally) |

---

## Executive summary

| Area | Verdict | Evidence |
|------|---------|----------|
| **RBAC — dispatcher vs full admin** | **PASS** | Integration 4/4 (dispatcher 403 on DELETE / 200 on GET, technician JWT 403, deactivated + deleted admin refused); static UI path matrix 52/52; middleware sets 9/9 (after harness fix); route scan no auth-only handlers; live matrix 92/92 (30 live allow/deny checks, all as expected) |
| **Hold/resume + hold-request approval (web + mobile)** | **PASS** | Static OH-UI/HR-UI 18/18 (web `JobDetails` hold/resume + approve/reject, mobile `job_detail_screen` approve/reject + Put on hold/Resume, jobs list pill, dashboard On Hold metric); admin API integration 15/15 (OH-A1–A6, HR1–HR3); live Railway 50/50 |
| **Leads, SOS/socket, business popup, finance** | **PASS with blockers** — admin lead pipeline, job location, finance users green; business popup, finance-portal smoke and the customer SR sub-path blocked by missing/invalid live QA accounts (not defects) | SOS e2e 3/3 (broadcast → claim → in_call, JWT-gated sockets); finance lock 1/1 (409 on double audit, reopen works); live leads 14/15 (customer sub-path blocked); live business popup BLOCKED (business login 401); finance users/portal users 17/17; portal smoke BLOCKED (finance@clicks.local 401) |
| **Field locking (source-locked jobs, SOS cancel reason)** | **PASS** | Unit 21/21 (cancel-reason validation + labels, tech/business source lock, partner period date lock); live API + DB 6/6 |

---

## Phase A — Local baseline

| # | Suite | Result | Notes |
|---|-------|--------|-------|
| A1a | `tests/integration/rbac.integration.test.js` | **4/4 PASS** | Job Dispatcher: 403 DELETE `/api/jobs/:id`, 200 GET `/api/jobs`; technician-role JWT 403 both; deactivated admin refused with valid token; deleted admin record refused |
| A1b | `qa-dispatcher-rbac.js` (local, no `ADMIN_URL`) | **60 PASS / 2 FAIL → 62/62 after script fix** | Static UI path matrix 52/52; middleware sets 7/9 → 9/9 (see QA-A1); route scan: no auth-only handlers. Live section hit `localhost:5000` → `ECONNREFUSED` (expected locally; covered in Phase B) |
| A2 | `qa-admin-field-locking.js` | **21/21 PASS** | SOS cancel reason (5), cancel-reason labels (3), job source locking (8), partner period date locking (5) |
| A3 | `qa-tech-multi-job-hold.js` (`SKIP_API=1`) | **18/18 PASS** | Admin-side subset: OH-UI shared `jobHold` service request/approve/reject; tech + admin routes; **admin web** Job Details hold/resume + approve/reject; **admin mobile** job detail approve/reject + Put on hold; jobs list truncated `hold_reason`; dashboard On Hold metric; `on_hold` canonical + non-blocking |
| A4a | `tests/integration/sos-e2e.integration.test.js` | **3/3 PASS** | createSOS broadcasts to admin; claim → `in_call` + customer notified; socket without valid JWT / without token rejected |
| A4b | `tests/integration/finance-lock.integration.test.js` | **1/1 PASS** | Second audit + updateFinance → 409; reopen → audit works |
| A4c | `tests/integration/technician-multi-job-hold.integration.test.js` | **15/15 PASS** | Admin-side: OH-A1 hold requires reason, OH-A4 create after hold, OH-A5 resume restores prior status, OH-A6 GET returns hold fields, PUT `on_hold` rejected, HR1 approve → `on_hold`, HR2 reject keeps fulfill path, HR3 direct hold supersedes pending request |

**Phase A total: 122/124 first pass, 124/124 after the dispatcher-script harness fix. No product failures.**

### QA-A1 — dispatcher script middleware harness (script bug, fixed)

`requireRoles()` in `clicks-admin-api/src/middleware/rbac.js` no longer trusts the JWT role claim alone: it also checks `Admin.exists({ _id: req.user.id, isActive: true })` so deactivated/deleted admins are refused (this is what `rbac.integration.test.js` proves). The script's unit harness called the middleware with `{ user: { role } }` — no `id`, no DB — so `requireOps allows Job Dispatcher` and `requireFullAdmin allows Admin` reported FAIL. The harness now supplies a user id and stubs `Admin.exists` for the unit checks; 9/9 middleware checks pass. Product behaviour unchanged.

---

## Phase B — Live Railway API smoke

Run order: dispatcher RBAC → field locking (API + DB) → leads → job location → business popup → hold/resume live → finance users → finance portal. Admin login succeeded (no 403/deactivation), so the full live phase ran.

### Summary

| # | Script | PASS / FAIL / WARN / SKIP | Verdict | First failure (status + snippet) |
|---|--------|---------------------------|---------|----------------------------------|
| 5 | `qa-dispatcher-rbac.js` | 92 / 0 / 0 / 0 | **PASS** | — |
| 6 | `qa-admin-field-locking-integration.js` | 6 / 0 / 0 / 0 | **PASS** | — |
| 7 | `qa-leads.js` | 14 / 1 / 0 / 0 | **PASS** (admin) / customer sub-path **BLOCKED** | `customer/SR path` — tech API login `401 {"error":"Invalid credentials"}` (customer@clicks.local) |
| 8 | `qa-job-location-links.js` | 37 / 7 / 2 / 0 → **47 / 0 / 2 / 0** after script fix | **PASS** (script fix; ENV-1 warning) | `tech create: address (lat,lng)` — `400 Invalid jobType` (legacy "Flat tire" in script); `location preserved` ×6 — API now normalizes URL → "lat, lng" (BEH-1) |
| 9 | `qa-business-portal-admin-popup.js` | 1 / 1 / 0 / 0 | **BLOCKED** | `business portal login` — `401 {"message":"Invalid credentials"}` (business@clicks.local) |
| 10 | `qa-tech-multi-job-hold.js` (live) | 50 / 0 / 0 / 0 | **PASS** | — |
| 11a | `qa-finance-users.js` | 17 / 0 / 0 / 0 | **PASS** | — |
| 11b | `qa-finance-portal.js` (`FINANCE_API` = admin API) | 0 / 1 / 0 / 0 | **BLOCKED** | `/api/finance/auth/login` — `401 Invalid credentials` (finance@clicks.local, hard-coded in script) |

### B5. Dispatcher RBAC live — `qa-dispatcher-rbac.js` — **92/92 PASS**

Static UI matrix 52/52 + middleware 9/9 + route scan, then live: admin API reachable, Super Admin and Job Dispatcher (`qa-job-dispatcher@clicks.local`) logins, dispatcher **allow** (200) on dashboard summary/job-completion, jobs, leads, SOS, service requests, technicians, live-map, vehicles, customers, sources, vehicle-makes; dispatcher **deny** (403) on dashboard earnings/technician-performance, performance, admins, partners, businesses, heatmap, DELETE customers/vehicles/jobs, POST sources, POST jobs/import, technician settlements; full admin allow on partners + earnings. Results: `scripts/qa-dispatcher-rbac-results.json`.

### B6. Field locking live (API + DB) — `qa-admin-field-locking-integration.js` — **6/6 PASS, 0 skipped**

GET `/api/sos` returns `cancel_reason`; partner PATCH rejects changed period dates and allows cap-only update; PUT `/api/jobs/:id` rejects source change on a locked (technician/business-origin) job and allows it on an admin job; cancelled SOS records carry `cancel_reason` in DB (9/9 recent). Mongoose printed a duplicate-index warning on `{ name: 1 }` (schema hygiene, see QA-B3).

### B7. Lead → job pipeline — `qa-leads.js` — **14/15** (admin pipeline PASS; customer SR sub-path BLOCKED)

Admin login; unauthenticated leads → 401; create lead; list filter; patch contacted; convert rejects missing fields (400); convert lead → job with `lead_id`; double convert → 400; mark lost; convert lost → 400; open list excludes converted. **FAIL** `customer/SR path` — customer login on tech API returned `401 {"error":"Invalid credentials"}` for `customer@clicks.local` (account missing/changed on live, see ACC-2). Not a script or product defect.

### B8. Job location / maps links — `qa-job-location-links.js` — first pass **37/7 FAIL/2 WARN → after script fix 47/0/2 WARN**

Unit suite 34/34 (parseJobLocation, toGeoPoint, resolver, geocode query extraction, goo.gl expansion, required-resolver 400s); client placeholder wiring 7/7 (admin web AddNewJob/AddJobModal/AddNewLead/ConvertLead, business web, technician + business Flutter); offline resolver samples 7/7; live: admin create with plain coords / Google URL / Waze URL → `locationCoordinates` correct; SDO assign → technician session receives the same coordinates; technician create with "address (lat, lng)" → coordinates in response and on admin GET; cleanup deleted 6.

First-pass failures and root causes:

| Check | HTTP / detail | Root cause | Action |
|-------|---------------|------------|--------|
| `tech create: address (lat,lng)` | `400 Invalid jobType` | script sent legacy `"Flat tire"`; tech create accepts canonical `JOB_TYPES` only (16-type catalog) | script → `"Flat Tire"` (tech + business create bodies; business portal validates the same way) |
| 6 × `… location preserved` (Google/Waze URL cases, tech create) | `location` returned as `25.3269467, 51.4883967` instead of the submitted URL | **intentional behaviour change in 31079ae**: `createJobRecord` and the technician create path now store `location` as the normalized "lat, lng" string (`formatGeoPointAsLocationString` — "for display and storage") after resolving coordinates; the original Maps/Waze link is not retained. Script (written 2026-08-24) asserted the pre-change behaviour. | script accepts raw input **or** normalized string; flagged as BEH-1 for product acknowledgement |

WARNs (environmental): business login 401 (ACC-1); `geocode fallback (Al Sadd) — no coords — GOOGLE_MAPS_API_KEY may be unset` (ENV-1).

### B9. Business portal → admin popup — `qa-business-portal-admin-popup.js` — **BLOCKED** (1 PASS / 1 FAIL)

Admin login OK; `POST /api/business/auth/login` for `business@clicks.local` → `401 {"message":"Invalid credentials"}`. The `newBusinessJob` socket popup path could not be exercised live. Local coverage: `sos-e2e` proves admin-namespace socket auth + broadcast; business → admin broadcast itself is untested live this run (ACC-1).

### B10. Admin hold/resume + hold-request approve/reject live — `qa-tech-multi-job-hold.js` — **50/50 PASS**

Same run family as the technician report: OH-A0 tech `/hold` → 404, OH-A2 hold without reason → 400, OH-A1 hold → `on_hold`, OH-A6 GET has `hold_reason`, OH-A4 create while held, OH-A5 resume restores `status_before_hold`, M5/M6/M9/M10/OH-3/H3/H4/H5/H6, HR1 pending → 409 duplicate → approve → `on_hold`, HR2 reject keeps fulfill path, HR3 direct hold supersedes pending; 10 test jobs deleted.

### B11a. Finance users — `qa-finance-users.js` — **17/17 PASS**

Admin creates finance user (400 on missing fields, 409 duplicate, 401 without admin token); user appears in admin list; finance portal login + `/me` + dashboard (completed=10901) + jobs list; wrong password 401; admin password reset (old 401 / new 200); deactivate → finance login 401.

### B11b. Finance portal smoke — `qa-finance-portal.js` — **BLOCKED**

Hard-coded `finance@clicks.local / Finance123!` → `401 Invalid credentials` on Railway (ACC-3). The portal itself is proven by B11a with an admin-created user (login, `/me`, dashboard, jobs list). Script also exits with a libuv assertion after the error (QA-B2, cosmetic).

---

## Phase C — Realtime / socket (live)

### C12. Admin location socket event — `verify-admin-location-event.js` — **PASS**

First run against Railway: `FAIL Unauthorized` — the script connected to `/admin` and `/technician` without a JWT, but both namespaces are auth-gated (`attachNamespaceAuth`: admin token must belong to an active Admin; technician token must belong to an approved, active technician) and the admin feed is room-scoped (`joinLiveMap`). Script patched to log in as admin + technician, pass `auth.token`, and join the live-map room (QA-B1).

Rerun: PASS admin received technicianLocationBatch {"technician_id":"6a5ea3b97c12fea43f51ed4f","latitude":25.301647016580805,"longitude":51.5516033837855,"updatedAt":"2026-09-03T20:37:16.287Z","lastLocationAt":"2026-09-03T20:37:16.287Z","locationStale":false}

Prerequisites present: `MONGODB_URI` (Atlas), test technician `omar.tech@clicks.local` in DB, `SOCKET_URL` = tech API.

---

## Phase D — Manual smoke — **MANUAL / NOT RUN**

None of the items below were confirmed in this run; operator fills in.

**Web admin (`clicks-interface`) — Super Admin / dispatch:**
- [ ] Login → dashboard loads; On hold count separate from Ongoing
- [ ] Jobs list: filter On hold; pill shows truncated reason
- [ ] Job Details: Put on hold (reason required) → Resume; reassign disabled while on hold
- [ ] Hold request banner: Approve → job `on_hold`; Reject → job stays on fulfill path
- [ ] SOS: claim → create job prefilled
- [ ] Service request → Add Lead prefilled
- [ ] Lead convert → job created with same fields as web
- [ ] Live map: markers update within ~8s; stale badge visible
- [ ] Sidebar RBAC: Job Dispatcher hides finance/partners/admin management

**Admin mobile (`clicks-admin`) — use `scripts/qa-admin-mobile-checklist.md`:**
- [ ] Job Dispatcher login; drawer RBAC matches web
- [ ] SOS socket (foreground) + FCM (background/killed)
- [ ] Job detail: hold request approve/reject; Put on hold / Resume
- [ ] Live map, leads, convert job flows
- [ ] Full admin: businesses, partners, finance, admin management load

**Web parity exit criteria (mobile):** Dispatcher completes SOS → job, SR → lead, lead → convert, assign/cancel, live map — without opening web for gaps on mobile. **Not verified this run.**

---

## Live Railway verdict

| Script | Result | Verdict |
|--------|--------|---------|
| Dispatcher RBAC | 92/92 | **PASS** |
| Field locking (API + DB) | 6/6 | **PASS** |
| Leads | 14/15 | **PASS** (admin pipeline) / customer SR sub-path **BLOCKED** (ACC-2) |
| Job location | 47/47 (+2 WARN) | **PASS** after script fix; ENV-1 geocode warning |
| Business popup | 1/2 | **BLOCKED** — business login 401 (ACC-1) |
| Hold/resume + HR approval | 50/50 | **PASS** |
| Finance users | 17/17 | **PASS** |
| Finance portal smoke | 0/1 | **BLOCKED** — finance@clicks.local 401 (ACC-3); portal proven via finance-users |
| Socket location event | PASS | **PASS** after script auth fix |

Admin login was never blocked. No product regression found versus the prior hold report (OH-A1–A6, OH-13–OH-20 unchanged) or the RBAC baseline (dispatcher allow/deny matrix identical to `qa-dispatcher-rbac-results.json`). Post-run technician session: `active_jobs=0` — no orphaned QA jobs.

---

## Cross-references

- `scripts/qa-tech-multi-job-hold-report.md` (2026-09-03): admin-side hold/resume and HR1–HR3 approval — static 18/18, integration 15/15, **live Railway 50/50** (OH-A0–A6, HR1–HR3, H4 admin follow-up create, H6 PUT `on_hold` rejected / `POST /hold` ok). Same run as this report's Phase B #10.
- `scripts/qa-on-hold-feature-report.md` §6.3 **OH-13–OH-20** (admin portal): Job Details hold section (OH-13), jobs list pill + truncated reason (OH-14), On hold filter (OH-15), dashboard On hold count excluded from Ongoing (OH-16), `held_by: admin` (OH-17), resume restores status (OH-18), reassign blocked while on hold (OH-19), hold modal requires reason (OH-20). All remain **PASS (code + API)**; browser click-through still deferred to manual Phase D.

---

## Open gaps / deferred items

| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| **QA-A1** | QA hygiene | `qa-dispatcher-rbac.js` middleware harness drifted from the hardened `requireRoles` (active-admin DB check). Fixed in script (uncommitted). | **Fixed (script)** |
| **ACC-1** | Live data | `business@clicks.local / Business123!` → 401 on Railway. Blocks business popup (B9) and the business location case (B8 WARN). Seed exists (`scripts/seed-business-portal.js`) — not run (production data change). | **Blocked** — needs account |
| **ACC-2** | Live data | `customer@clicks.local / Customer123!` → 401 on tech API. Blocks leads customer/SR auto-lead sub-path (B7). Seed: `scripts/seed-production-accounts.js`. | **Blocked** — needs account |
| **ACC-3** | Live data / QA hygiene | `qa-finance-portal.js` hard-codes `finance@clicks.local / Finance123!`, which is 401 on Railway. Portal proven via B11a. Recommend env-driven creds. | **Blocked** — needs account |
| **ENV-1** | Live config | Plain-address geocode fallback ("Al Sadd") returned no coordinates on Railway → `GOOGLE_MAPS_API_KEY` may be unset on the admin-api service. Since 31079ae job create **requires** resolvable coordinates (`resolveJobLocationToGeoPointRequired` → 400), admins entering a plain address on production would be rejected. Verify Railway env. | **Open — check before ship** |
| **BEH-1** | Behaviour change | `location` is now stored as normalized "lat, lng" after resolving; a submitted Google Maps / Waze link is not retained on the job (both admin and technician create, since 31079ae). Coordinates are correct everywhere. Product should confirm losing the original link is acceptable. | **Open — product ack** |
| **QA-B1** | QA hygiene | Script drift fixed (uncommitted): `qa-job-location-links.js` legacy `"Flat tire"` jobType (tech + business bodies) and pre-31079ae "location preserved" assertion; `verify-admin-location-event.js` no socket JWT / live-map room join. | **Fixed (scripts)** |
| **QA-B2** | QA hygiene | `qa-finance-portal.js` crashes with a libuv assertion (exit 127) after a failed login instead of exiting cleanly. Cosmetic. | **Open** — minor |
| **QA-B3** | Schema hygiene | Mongoose warning: duplicate index on `{ name: 1 }` (index declared via both `index: true` and `schema.index()`), seen when scripts load shared models. | **Open** — minor |
| **MAN-1** | Manual | OH-13–OH-20 browser click-through and all Phase D web/mobile items remain unverified by a human this run. | **Deferred** |
| **MAN-2** | Manual | Admin mobile SOS FCM (background/killed) and drawer RBAC parity need a device; `scripts/qa-admin-mobile-checklist.md` not executed. | **Deferred** |

---

## Sign-off checklist

- [x] Automated local: RBAC integration 4/4, dispatcher static matrix + middleware 62/62, field locking unit 21/21, hold static 18/18, SOS e2e 3/3, finance lock 1/1, hold integration 15/15
- [x] Live Railway (Super Admin active): dispatcher RBAC 92/92, field locking 6/6, leads 14/15, job location 47/47, hold/resume 50/50, finance users 17/17
- [ ] Live Railway blocked by missing QA accounts: business popup (ACC-1), customer SR sub-path (ACC-2), finance-portal smoke (ACC-3)
- [x] Live socket: admin receives `technicianLocationUpdate` on Railway (after script auth fix)
- [ ] Manual web (`clicks-interface`): dashboard/jobs/hold/HR banner/SOS/SR/leads/live map/sidebar RBAC
- [ ] Manual mobile (`clicks-admin`): dispatcher login + drawer RBAC, SOS socket + FCM, hold approve/reject, live map/leads/convert, full-admin modules
