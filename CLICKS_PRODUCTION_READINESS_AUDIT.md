# Clicks Platform — Production-Readiness Audit

**Prepared for:** Clicks (Be Electric, Qatar) leadership / engineering
**Date:** 19 August 2026
**Scope:** Full monorepo (`clicks-workspace`) — 2 backend APIs + shared package, 3 React web portals, 1 marketing site, 4 Flutter apps, ops/deploy/QA/docs, and deployed-behaviour reasoning.
**Method:** Direct source inspection (read-only, no code modified) of the working tree staged from the connected machine, cross-checked against internal docs. Deployed production endpoints were **not** live-probed; findings from code are marked accordingly and anything not directly verifiable is marked **UNVERIFIED**.

> **Verdict in one line:** Clicks is a **genuine, functional soft-launch system (≈5.5/10)** built by someone who has clearly absorbed real security lessons — but it is **not ready for a Qatar public launch at "thousands of jobs/day"** until a short list of P0/P1 items (live-secret exposure, zero observability on a life-safety SOS path, a technician-earnings double-credit race, deploy-from-uncommitted-laptop, and three unthrottled privileged logins) are closed. The self-assessed ~68/100 is a fair measure of *code wiring*; true *operational* readiness for public scale is lower.

---

## 1. Executive Summary

**Is Clicks production-ready for a Qatar public launch? No — not yet. It is ready for a controlled, monitored soft launch to a small cohort, and only after Phase 0 below.**

The platform is substantially more mature than a prototype. The critical customer→technician→completion path is wired end-to-end across API, sockets, and the Flutter apps. There is real, non-cosmetic security work here: OTP verification is hardened against the classic NoSQL-operator account-takeover (timing-safe compare, attempt caps, CSPRNG codes), request bodies are sanitised of Mongo operators, admin RBAC is enforced **server-side** on every route (not just hidden in the UI), job/SOS/vehicle access is ownership-checked, and sockets require a valid JWT per namespace. Partner earnings are made idempotent by a database unique index. These are the marks of a team that has already been through one security pass.

But several things stand between "wired in code" and "safe at public scale":

1. **Life-safety blindness.** For an emergency roadside/SOS product there is **no error tracking, no crash reporting, no alerting, and a health check too shallow to detect a broken dispatch.** If SOS dispatch breaks at 2 a.m. in Doha, no one finds out until a customer complains. For this product category that is the single most serious gap.
2. **Live secrets in a plaintext transfer file**, with the *same* JWT signing secret, Mongo password, and Google Maps key reused across every environment and all client apps; and dev instructed to connect to the **production** database.
3. **A technician-earnings double-credit race** — the completion "idempotency guard" is a non-atomic read-then-write, so a double-tap or network retry can pay a technician twice.
4. **No finance double-audit lock** — an already-audited job can be silently re-audited and its numbers overwritten, defeating the whole point of an immutable audit.
5. **Deploy provenance is untraceable** — production is deployed by uploading a developer's *local working tree* (currently ~92 uncommitted changes, including the entire finance portal), so production is running code that exists in no git ref.
6. **Three privileged password logins (business, finance, partner) have no rate limiting**, unlike admin/customer/technician.
7. **Client secrets committed** in the Flutter apps (Google/Firebase keys, `google-services.json`, iOS `GoogleService-Info.plist`), JWTs stored in `SharedPreferences`/`localStorage`, and **iOS technician push notifications are non-functional** (no APNs config, no `remote-notification` background mode).

None of these are architectural dead-ends. Most are days-to-weeks of focused work. The recommendation is a hard **Phase 0 (Emergency)** — rotate every secret, add crash/error monitoring and SOS alerting, fix the earnings race and the audit lock, throttle the three logins, and pin production to a git tag — before any public cohort beyond dogfood.

---

## 2. Architecture Overview (plain English)

Clicks is a roadside-assistance dispatch platform for Qatar. A customer in trouble raises an SOS or service request; the system finds/assigns a nearby technician; the technician navigates, starts the job (only when physically near the vehicle), performs the work, collects payment and a signature, and completes it; money accrues to the technician and, if the job was attributed to an acquisition partner, to that partner; a finance operator later audits the job's true cost and net profit. Businesses/dealerships can also create jobs directly, and admin ops staff run the whole board from a live map.

**Two backends share one database:**

- **`clicks-admin-api`** (Railway, port 5000) — everything "back office": admin CRUD, RBAC, jobs (admin side), leads, SOS inbox, partners, businesses, finance portal, sources, vehicles, dashboards.
- **`clicks-customer-tech-api`** ("tech-api", Railway, port 5001) — everything "field": customer + technician auth/OTP, SOS creation and broadcast, the **Socket.IO realtime layer** (live map, tracking, job lifecycle), FCM push, Google Maps proxy, receipts.
- **`clicks-shared`** — Mongoose models, and the security-critical shared utilities (`otpVerify`, `coerce`, `sanitize`, `financeJobPreview`, `partnerService`, ownership). Both APIs import it.
- **MongoDB Atlas** — one shared cluster. **JWT_SECRET and INTERNAL_API_SECRET are shared** across the two APIs (by design — a token minted by one is honoured by the other; internal calls use an `x-internal-secret` header).

**Seven+ clients:**

| App | Type | Talks to | Realtime |
|---|---|---|---|
| `clicks-interface` | Admin web (React/Vite, Vercel) | admin-api | Socket.IO `/admin` + polling |
| `clicks-business-web` | Business portal web (React/Vite, Vercel) | admin-api `/api/business/*` | Polling ~20–30 s |
| `clicks-finance-web` | Finance portal web (React/Vite, Vercel) | admin-api `/api/finance/*` | Polling 30 s |
| `clicks-landing` | Marketing (Astro, Vercel) | — | — |
| `clicks-technician` | Technician (Flutter) | tech-api + sockets | Socket.IO `/technician` |
| `clicks-user` | Customer (Flutter) | tech-api + sockets | Socket.IO `/customer` |
| `clicks-business` | Business (Flutter) | admin-api `/api/business/*` | — |
| `clicks-partner` | Partner (Flutter, Arabic-first) | admin-api `/api/partner/*` | — |

**Deployment reality:** APIs on **Railway** (project `melodious-achievement`) deployed **manually** by running PowerShell scripts (`ops/deploy-*-production.ps1`) that `railway up` from a laptop's local files. Web portals on **Vercel**, deployed manually. A **staging VPS** auto-deploys via GitHub Actions on push to the `staging` branch (PM2, single instance). Flutter apps are **manually built APKs** (`release-apks/`), not auto-distributed. Sockets use an **in-memory adapter** (single instance) with an opt-in Redis path documented but, per §Technical below, **not sufficient for horizontal scale as currently coded.**

**Confirmed vs partial vs missing (high level):**

- **Confirmed & working in code:** customer OTP auth, technician lifecycle (login→online→accept→en route→arrived→start w/ proximity→complete), live-map presence + location throttle, SOS creation/broadcast/claim over sockets, partner attribution + cap, finance preview/audit, business job creation + admin popup, server-side RBAC, ownership checks, hardened OTP.
- **Partial:** finance immutability (audit exists but not locked), horizontal scaling (Redis adapter present but socket targeting uses per-process maps), i18n (customer app complete; technician/business essentially English-only), iOS push (customer OK, technician broken).
- **Missing:** observability/alerting, automated tests in CI, incident runbook, refresh-token rotation/logout invalidation, production secret-rotation runbook, PII-at-rest protection.
- **Broken-looking:** technician iOS FCM; admin web token refresh (only fires on 403, never 401); business/partner Flutter release builds default to `http://10.0.2.2:5000` (emulator localhost).
- **Drift risk:** production is deployed from an uncommitted local tree; the entire `clicks-finance-web` is untracked yet already CORS-authorised in production.

---

## 3. Critical Findings (P0 / P1)

### P0 — Blockers (must fix before any public cohort)

**P0-1 — Live production secrets distributed in plaintext; secrets shared across all environments.**
`SECRETS.TRANSFER.md` (repo root) contains live production values in cleartext: Atlas Mongo URIs *with passwords* (a real password is even printed inline in prose at line 88), `JWT_SECRET`, `JWT_REFRESH_SECRET`, `INTERNAL_API_SECRET`, the SMSala API token, the Google Maps key, and **two full Firebase service-account private keys** (`-----BEGIN PRIVATE KEY-----` blocks for `clicks-technician-qa` and `clicks-customer`). The **same** Maps key and JWT secret are reused across server, all Vercel frontends, and all four Flutter apps. Dev is explicitly told to point at the **production** database. The file *is* gitignored and CI runs Gitleaks, so it is likely not in the pushed repo — but it exists on at least two machines and travels by USB, and shared-everywhere secrets mean one leak compromises every surface. *Impact: total platform compromise, DB exfiltration, token forgery. Fix: rotate every secret now; give each environment distinct values; keep admin/tech JWT+internal secrets matched to each other but unique per environment; move secrets to Railway/Vercel secret stores; delete the transfer doc; restrict the Maps key by referrer/app.*

**P0-2 — No observability on a life-safety SOS path.** No Sentry/APM (present only in `package-lock.json`, never initialised), no Flutter Crashlytics, no alerting, and `/api/health` returns a static `{status:"ok"}` that passes even if MongoDB or the socket adapter is down (Railway health-checks this path). Structured JSON logs exist (`clicks-shared/middleware/observability.js`) but only to stdout with no shipper/retention/alert. **Would the team know if SOS dispatch broke at 2 a.m.? No.** *Fix: initialise Sentry in both APIs + Crashlytics in both critical Flutter apps; make `/api/health` check DB + adapter; add a synthetic SOS probe + pager alert.*

**P0-3 — Technician-earnings double-credit race.** In `clicks-customer-tech-api/src/controllers/jobController.js` `markCompleted`, idempotency is a non-atomic read-then-write: it checks `if (job.job_status === "completed") return`, then later `job.save()` and unconditionally `$inc`s `total_earned`, `cash_balance`, and weekly buckets on `TechnicianEarnings` (which has **no** per-job unique guard, unlike `PartnerEarning.job` which is `unique:true`). Two concurrent completions (double-tap, client retry, at-least-once network) both read `in_progress`, both pass the guard, both credit. *Impact: technician paid twice; cash_balance corruption. Fix: make the transition atomic — `Job.findOneAndUpdate({_id, job_status:"in_progress"}, {$set:{job_status:"completed"}})` and credit only when a document was matched; or add a `TechnicianEarnings` per-job ledger row with a unique index mirroring `PartnerEarning`.*

**P0-4 — Deploy from uncommitted local tree (untraceable production).** `ops/deploy-*-production.ps1` runs `railway up`, which uploads the laptop's local files, not a git ref — no commit SHA, tag, or provenance. The working tree currently has ~92 uncommitted changes (60 modified, 32 untracked), **including the entire `clicks-finance-web` portal**, which is untracked yet already CORS-authorised against production (`ops/apply-finance-portal-cors.ps1`). Production is therefore almost certainly running code that exists in no git ref; if that laptop is lost, production is unreproducible. The deploy scripts also **rewrite `railway.toml` in place** to switch which Dockerfile is built, relying on a `finally` block to restore it — an interrupted run leaves the wrong service selected. *Fix: commit everything; deploy only from a tagged git ref via CI; stop mutating `railway.toml` at runtime (use per-service config).*

### P1 — Critical (fix before scaling beyond dogfood)

**P1-1 — No finance double-audit lock (audit is not immutable).** `financePortalController.auditJob` and `updateFinance` never check whether `job.finance_status === "audited"` already. Re-calling `POST /api/finance/jobs/:id/audit` on an audited job overwrites `finance_revenue`, `finance_net_profit`, `finance_audited_by`, and `finance_audited_at`, and `updateFinance` can still mutate its repair costs. The UI hides audited jobs from the pending list, but the API accepts the id directly. No prior-value history is kept. *Impact: audited financials silently rewritable; segregation-of-duties and auditability defeated. Fix: reject mutations when `finance_status==="audited"` (return 409) unless a separate, logged "re-open" privilege is exercised; write an append-only audit-history record.*

**P1-2 — Three privileged logins with no rate limiting.** `authLimiter` is applied to admin login and to customer/technician OTP, but **not** to `POST /api/business/auth/login`, `POST /api/finance/auth/login`, or `POST /api/partner/login`. These are password logins into privileged portals (finance can rewrite money; business/partner see job and earnings data). *Impact: unthrottled credential brute-force. Fix: apply `authLimiter` to all three.*

**P1-3 — Web session weaknesses.** JWTs (incl. the admin **refresh** token) are stored in `localStorage` across all three portals → any XSS steals a long-lived token. Admin logout is client-only (never calls `/auth/logout`), so a captured refresh token stays valid after "logout." Admin token-refresh fires only on HTTP **403**, never **401**, so an expired access token neither refreshes nor logs out — inconsistent with business/finance (which logout on 401). *Fix: httpOnly cookies or documented risk acceptance + short access-token TTL; server-side refresh revocation on logout; handle 401.*

**P1-4 — Client secrets committed + technician iOS push broken.** Flutter apps commit `google-services.json`, iOS `GoogleService-Info.plist`, and Maps keys in `Info.plist`/`local.properties` (four different Maps keys across two apps, none evidently restricted); tokens are stored in `SharedPreferences` (plaintext, not `flutter_secure_storage`). The technician app has **no** `GoogleService-Info.plist` and no `remote-notification` background mode → **iOS technicians will not receive job pushes**, and iOS camera use will crash for lack of `NSCameraUsageDescription`. *Fix: rotate + un-commit keys and restrict them; move tokens to secure storage; add technician iOS APNs config, `remote-notification` mode, and camera/photo usage strings.*

**P1-5 — Best-effort cross-API dispatch notifications.** Business job creation calls tech-api's internal notify endpoint over axios to fire the admin popup; SOS/customer notifications and partner accrual are wrapped in try/catch that log-and-continue. If tech-api is momentarily down, the job/lead is created but the **admin popup never fires and nothing retries** — a dispatch can be silently missed. *Fix: durable event/outbox with retry, or at least surface failures to an alert.*

**P1-6 — Multi-instance sockets won't actually work as coded.** Realtime targeting uses per-process in-memory Maps (`technicianSockets`, `customerSockets` keyed by user id) rather than Socket.IO rooms. The Redis adapter shares room pub/sub, but a lookup like `customerSockets.get(id)` only finds a socket registered on *this* process, so with `TECH_API_INSTANCES > 1` a customer on instance A misses a technician's updates emitted from instance B. The documented "set REDIS_URL then scale" path is therefore insufficient without a refactor to `socket.join(userRoom)` + `io.to(userRoom).emit`. *Fix: replace the manual maps with per-user rooms before horizontal scaling.*

---

## 4. Security Findings

**Strengths (verified in code — do not re-litigate these):**

- **NoSQL-injection / OTP takeover is fixed.** `clicks-shared/utils/otpVerify.js` never puts user input in the query filter, compares with `crypto.timingSafeEqual`, caps attempts atomically, expires codes, and generates codes with `crypto.randomInt`. `coerce.js` + `sanitize` middleware strip Mongo operators request-wide (currently strip-and-log; flip `SANITIZE_REJECT=true` after a clean week).
- **RBAC is enforced server-side**, not just in the UI. Every admin route pairs `authenticateToken` with `requireOps` or `requireFullAdmin` (`middleware/rbac.js`); ops roles (Dispatcher/Coordinator/Call Center) are genuinely blocked from admin-only routes at the API. Cross-role tokens (a customer/technician JWT, valid under the shared secret) are rejected because their role isn't in the ops/admin sets. `qa-dispatcher-rbac.js` exercises this.
- **IDOR is defended.** `utils/ownership.js` scopes job/SOS/vehicle access by `customer_id`/`assignedTechnician`; partner/business/finance portals scope every query by the authenticated principal's own id (`req.user.id` / `business_id`). Sockets derive identity from the JWT and ignore client-supplied ids, and re-check job access before emitting to a counterpart.
- **Socket auth**: each namespace (`/customer`, `/technician`, `/admin`) has JWT middleware; the legacy root namespace is unauthenticated but only warns and does nothing.

**Open issues (beyond the P0/P1 above):**

| Sev | Finding | Evidence |
|---|---|---|
| HIGH | Business/finance/partner logins unthrottled (P1-2) | `routes/{businessPortal,financePortal,partnerPortal}.js` — no limiter |
| HIGH | localStorage JWT incl. refresh token; client-only logout (P1-3) | `clicks-interface/src/store/store.js`, `AdminSidebar.jsx` |
| MED | Stored-XSS sink: `dangerouslySetInnerHTML` on API HTML w/o sanitisation | `PrivacyPolicyPage.jsx:56`, `TermsAndConditionsPage.jsx:56` |
| MED | Unprotected `/demo` route renders admin shell to anyone | `clicks-interface/src/App.jsx` (no `ProtectedRoute`) |
| MED | Internal-secret compare is plain `!==` (not constant-time); accepted via Bearer too | `middleware/internalAuth.js` |
| MED | CORS falls back to permissive when `CORS_ORIGINS` unset (dev fallback `origin:true`) | both `index.js` |
| MED | Google Maps key shipped client-side & reused everywhere; restriction UNVERIFIED | `googleMapsLoader.js`, Flutter configs |
| LOW | No security headers/CSP on landing `vercel.json`; scratch files committed | `clicks-landing/` |

CSRF is largely moot (token-in-header, not cookies). Source maps are **not** leaked (Vite default off). File uploads go to Azure Blob — validate content-type/size server-side (UNVERIFIED whether enforced).

---

## 5. Product & UX Findings (per user type)

**Customer (`clicks-user`) — strongest Flutter app.** OTP register/login, SOS with resilient socket (999 reconnect attempts, foreground re-ensure, duplicate-listener guard), live tracking, receipts, rating, full EN/AR translations, FCM working on both platforms. Gaps: the core `sos_cubit.dart` emits across `await` with **no `isClosed` guard** (18 emits, 0 guards) → crash risk if the user navigates mid-request during the most stressful moment of the product; production points at the temporary `*.up.railway.app` host because `tech-api.clicks.qa` DNS isn't configured.

**Technician (`clicks-technician`) — most engineered, but iOS-broken.** Excellent location layer (Android foreground service with wake/wifi locks, iOS background updates, heartbeat + stale-fix reuse, Always-permission gate, dual socket+REST dispatch). Server-enforced proximity gate is correct (client value is a hint only). But: **iOS push is non-functional** (P1-4); the **technician socket has no auto-reconnect** (unlike the customer app) so job-lifecycle events can be silently lost mid-job in a tunnel/elevator until app resume; Arabic is effectively unimplemented (10-line translation files, hardcoded English UI) — a real problem for a Qatar field workforce.

**Admin ops (`clicks-interface`) — capable, some rough edges.** Live map, SOS inbox, business-job popups, lead pipeline, job board all present with socket + polling. Real role-based route guards *and* nav filtering. Weaknesses: 401 refresh bug and client-only logout (P1-3); 1,200-line `JobDetails.jsx`; three separate socket connections per session; unprotected `/demo`.

**Business (`clicks-business-web` + Flutter) — functional, duplicated, thin.** Web portal polls 20–30 s (no live push for new jobs), single access token, no "session expired" messaging on silent logout, and its dev proxy **defaults to the production Railway API** (risk of hitting prod data locally). The Flutter business app has **no push and no i18n**, and its release build defaults to emulator-localhost — non-functional without dart-defines. Logic is duplicated between the web and Flutter business clients with no shared contract.

**Partner (`clicks-partner`) — small, Arabic-first, cleanest lifecycle hygiene** (correct `mounted` guards), genuine Arabic translations + RTL. But Android manifest declares only `INTERNET` (missing `POST_NOTIFICATIONS` → Android 13+ suppresses notifications), FCM handles foreground only (no background/killed/token-refresh), and release build defaults to localhost.

**Finance (`clicks-finance-web`) — thinnest UX-state coverage**, single token, poll-only, no role gating client-side (relies fully on server, which is fine). The workflow works but the audit is not locked (P1-1) and there's no explicit confirmation/immutability affordance.

**Cross-app consistency problem:** the same job status renders differently per surface — business derives labels generically (`in_progress`→"In Progress", `assigned`→"Assigned") while admin hardcodes different strings (`assigned`→"Technician assigned", `en_route`→"Enroute"). Seven+ surfaces, no shared status vocabulary. Low severity, high cumulative confusion for ops + partners.

**Missing failure/empty/offline states** are uneven: admin covers loading/error broadly; finance barely. Offline handling for field technicians relies on socket reconnection + REST heartbeat for GPS, but **job events have no offline queue** on the technician side.

---

## 6. Technical Findings

**Database (MongoDB/Atlas).** Schemas are reasonable; `Job` has good compound indexes (`{job_status, assignedTechnician, createdAt}`, `{customer_id,…}`, `{business_id,…}`, a `2dsphere` on `locationCoordinates`, and `{job_status, finance_status, completed_at}`), plus `timestamps`. `PartnerEarning.job` is `unique:true` (idempotent accrual — good). Concerns: **no transactions** anywhere (the earnings and status transitions that most need atomicity use read-then-write); **cleartext PII** (`clientMobileNumber`, `location`) with no field encryption or `select:false`; **no formal migrations** (ad-hoc `backfill-*.js` scripts); `TechnicianEarnings` lacks the per-job uniqueness that `PartnerEarning` has (P0-3). Retention policy is TBD (self-scored 35/100 on PII — accurate).

**Dual-API architecture.** Sensible split, but business rules are duplicated where the two APIs overlap (job lifecycle exists in both the tech-api REST controller **and** the socket service, and job creation logic is echoed in `createJobRecord` + controllers). The shared-secret + shared-DB coupling is pragmatic for now but means a JWT-secret rotation requires a coordinated restart of both services (documented). The `mongoose` version skew (`clicks-shared` pins ^7, both APIs declare ^8) is a real trap the team already hit once (`jobHeatmapController` bare-require bug) — pin one version.

**Sockets.** JWT-authenticated per namespace, location writes throttled ~3 s, presence + stale-location handling, admin fanout. The horizontal-scale story is broken as coded (P1-6). Single-instance in-memory adapter is correct for soft launch.

**Frontend/mobile.** React portals are standard RTK-Query SPAs; the DataTable component is copy-pasted three times. Flutter apps are mostly Cubit/Bloc (partner is the odd `setState` one); the pervasive **emit-after-await without `isClosed`** pattern is a latent crash source across three of four apps.

---

## 7. Operations Findings

- **CI runs no real tests.** `ci.yml` has a Gitleaks scan (the one genuine gate) and an "api-smoke" job whose "start APIs" step is literally `node -e "console.log('deps ok')"` and whose auth smoke is `node --check` (syntax only) unless staging URLs are set. No unit tests, lint, build, or type check. No monorepo-root CI.
- **Production deploys are manual and un-gated** (Railway via laptop PowerShell; Vercel manual; APKs manual). Only the staging VPS auto-deploys (on `staging` push).
- **QA scripts are ad-hoc, not tests.** 19 `qa-*.js` + smoke scripts cover many journeys (finance audit, partner attribution, dispatcher RBAC, tech full-job, business popup, leads) but **none run in CI**, several **default to production endpoints** with shared demo passwords (`Tech123!`, `Admin123!`), and `qa-smsala.js` **sends real SMS** against prod. The most safety-critical journeys — **customer SOS e2e** and **socket reconnect during an active job** — have **no coverage at all**; OTP security has no brute-force/replay test.
- **Ops tooling gaps.** Several tasks still need a developer: seeding accounts (`seed-*.js`), CORS changes (three different scripts across Railway/Vercel), secret rotation (staging runbook only — **no production rotation runbook**), and there's a hardcoded laptop path in `retry-tech-deploy.ps1` (`C:\Users\TS\...`).
- **Audit logging is thin.** Finance overwrites `finance_audited_by` with no history; admin job edits/dispatch/cancel are not recorded as attributable audit events ("who cancelled job X, when, from where" is not answerable). This matters for a money-touching ops product.
- **Docs** are strong on deploy/SOS/staging but **missing**: an OpenAPI/API reference, a canonical socket-event catalog, an **incident-response runbook**, and developer onboarding.

---

## 8. Finance & Earnings Findings

- **Technician earnings (SoT `TechnicianEarnings`)** — correct as a source-of-truth concept, but the completion credit is **not atomic and not idempotent under concurrency** (P0-3). This is the highest-value integrity bug in the system.
- **Partner earnings** — **idempotent** via `PartnerEarning.job` unique index; cap/frozen/capped status transitions are handled; accrual is wrapped in a swallow-and-log try/catch, so a transient failure means the partner is simply never credited with **no retry/reconciliation** (silent under-payment). Add a reconciliation job.
- **Finance audit** — preview logic is unit-tested (`financeJobPreview.test.js`); revenue/cost/net-profit computed from job pricing + repairs + extra costs. But **audited records are overwritable** (P1-1) and there is no append-only history — so "audited" is not actually a locked, reconcilable snapshot.
- **Segregation of duties** exists at the role level (finance role distinct from admin/ops, enforced server-side) — good. Monetary values are plain `Number` (floating-point); for QAR amounts this is low-risk but store integer minor units (dirhams) if you ever do multiplication/rounding at scale.
- **Completion controls are good**: completion requires `payment_status==="paid"` **and** a customer signature — a strong real-world guard against premature completion.

**Financial-truth rule check:** earnings do **not** rely on UI state (server writes on completion), which is correct — but the write path itself needs to be made atomic/auditable/reconcilable to fully satisfy "every financial write is atomic, traceable, auditable, reconcilable."

---

## 9. Scorecard (0–10) and comparison to prior ~68/100

| # | Category | Score /10 | Note |
|---|---|--:|---|
| 1 | Product completeness | 6.5 | Critical path wired end-to-end; finance/partner/business real |
| 2 | UX (multi-app consistency) | 5.0 | Status vocabulary diverges across 7 surfaces; uneven states |
| 3 | User flows (SOS, dispatch, lifecycle) | 6.5 | Solid happy path; weak offline/recovery on tech job events |
| 4 | Security | 6.0 | Strong hardening; undone by secret exposure + 3 unthrottled logins |
| 5 | Authentication (multi-portal) | 6.0 | OTP excellent; no refresh rotation/logout revocation; portal rate-limit gaps |
| 6 | Authorization / RBAC | 7.5 | **Server-enforced everywhere** — a genuine strength |
| 7 | Database (MongoDB) | 5.5 | Good indexes; no transactions; cleartext PII; no migrations |
| 8 | API / backend (dual-API) | 6.0 | Clean split; duplication; earnings/audit atomicity gaps |
| 9 | Frontend / mobile (7 clients) | 5.0 | Customer app good; technician iOS broken; localStorage/SharedPreferences tokens |
| 10 | Performance | 5.5 | Indexed + throttled; large lists/aggregations untested at 10k+ |
| 11 | Testing / QA | 3.0 | Ad-hoc scripts, none in CI, run against prod; SOS/reconnect untested |
| 12 | DevOps / deploy hygiene | 3.0 | Deploy from uncommitted laptop tree; runtime-mutated config |
| 13 | Monitoring / observability | 2.0 | None on a life-safety product |
| 14 | Reliability (sockets/SMS/FCM) | 5.0 | Best-effort notifies; tech socket no reconnect; SMS console-fallback |
| 15 | Scalability | 4.5 | Redis path insufficient as coded; single-instance now fine |
| 16 | Admin / ops tooling | 6.0 | Rich admin; still needs devs for seeds/CORS/rotation |
| 17 | Notifications (FCM/SMS/popup) | 5.0 | Customer OK; technician iOS + partner background broken; popups best-effort |
| 18 | Analytics | 3.0 | `analyticsController` exists; no event taxonomy/funnel |
| 19 | Documentation | 6.0 | Good deploy/SOS docs; no API/socket/incident/onboarding |
| 20 | Finance / earnings readiness | 5.0 | Partner idempotent; tech race + no audit lock |

**Overall Production Readiness: ≈ 5.5 / 10 — "Functional production (soft launch)."**

**On the prior ~68/100:** I largely **confirm** it as a measure of *code completeness/wiring* — the areas it scored high (RBAC, realtime, data integrity of the happy path) hold up under inspection. But that scorecard **understated three things that matter most for a public launch**: observability (it scored 55 on ops but there is effectively *zero* runtime monitoring), release/deploy hygiene (55, but production is deployed from an uncommitted laptop tree), and finance/earnings atomicity (folded into "data integrity 70," but the technician double-credit race and the missing audit lock are real integrity holes). Normalising to a "safe at Qatar public scale" question rather than "is the code written," the honest overall is **~5.5/10**, not 6.8.

---

## 10. Priority Roadmap

### Phase 0 — Emergency (P0) — *do before any cohort beyond internal dogfood; ~1–2 weeks*
1. **Rotate every secret** (Atlas password, JWT + refresh + internal secrets, SMSala token, Maps key, both Firebase keys); give each environment distinct values; move to Railway/Vercel secret stores; delete `SECRETS.TRANSFER.md`; restrict the Maps key. (P0-1)
2. **Add observability**: Sentry in both APIs, Crashlytics in customer+technician apps, deepen `/api/health` (DB + adapter), a synthetic SOS probe + pager alert. (P0-2)
3. **Fix the technician-earnings race**: atomic status-gated completion + credit-on-match (or per-job earnings ledger with unique index). (P0-3)
4. **Pin production to git**: commit the working tree (incl. finance portal), deploy only from a tagged ref, stop mutating `railway.toml` at runtime. (P0-4)

### Phase 1 — Production readiness (P1) — *before limited public; ~2–4 weeks*
5. Finance **double-audit lock** + append-only audit history. (P1-1)
6. **Rate-limit** business/finance/partner logins. (P1-2)
7. Web session hardening: 401 handling, server-side logout revocation, short access-token TTL (or httpOnly cookies). (P1-3)
8. Flutter: rotate+un-commit client keys and restrict them; secure token storage; **fix technician iOS push** + camera usage strings; technician socket auto-reconnect; partner `POST_NOTIFICATIONS` + background FCM. (P1-4)
9. Durable **outbox/retry** for cross-API dispatch notifications + partner accrual reconciliation. (P1-5)
10. Make **release builds fail-closed** (no staging/localhost defaults) for business/partner apps.
11. Minimal **CI test gate**: real API integration tests for SOS e2e, tech accept→start→complete (proximity), finance audit-lock, RBAC server-side, OTP security; run on PR.

### Phase 2 — Hardening (P2) — *before multi-city; ~1–2 months*
12. Refactor sockets to **per-user rooms** so Redis actually enables horizontal scale. (P1-6)
13. MongoDB **transactions** on money/status transitions; introduce a migration tool; begin PII-at-rest strategy + retention policy.
14. Unify **job-status vocabulary** across all surfaces (shared enum + label map).
15. Incident-response runbook, production secret-rotation runbook, OpenAPI + socket-event catalog, onboarding doc.
16. Sanitise the two `dangerouslySetInnerHTML` sinks; protect/remove `/demo`; add landing security headers.
17. Add **audit logging** for admin job edits/dispatch/cancel (who/what/when/where).

### Phase 3 — Scale & optimisation (P3)
18. Load-test admin/lead lists + geospatial SOS at 10k+ jobs; add read replicas / M30 before ~200k.
19. Product analytics event taxonomy (see §14) + dispatch-SLA/completion/cancel dashboards.
20. Technician/business i18n completion; iOS/Android parity pass; consolidate business web+Flutter behind a shared API contract; de-duplicate the DataTable.

---

## 11. Recommended Target Architecture (summary)

- **Deploy pipeline:** GitHub Actions → build/test/scan on PR → deploy on tag to Railway (both APIs) and Vercel (portals) from the *tagged ref*, recording the SHA. APKs built in CI with prod dart-defines and versioned to backend contract. Kill the laptop `railway up` path.
- **Sockets at scale:** per-user rooms (`user:{id}`, `tech:{id}`) + Redis adapter + sticky sessions; then `TECH_API_INSTANCES>1` is safe.
- **Data:** transactions for money/status; integer minor units for currency; field-level protection for phone/location; formal migrations; Atlas M10 soft-launch → M30 pre-scale, PITR verified.
- **Observability:** Sentry + Crashlytics + structured logs shipped to a store + uptime/synthetic SOS probe + on-call pager. This is the highest-ROI addition for a life-safety product.
- **Events:** an outbox table for cross-API/dispatch notifications with retry + a reconciliation job for partner/technician earnings.

## 12. Recommended User Flows (targets)
- **SOS:** create → broadcast to nearby → accept (atomic claim) → assigned push (with FCM+socket+SMS fallback) → track → arrive → start (server proximity) → complete (paid+signature) → receipt/rate; every step emits an analytics event and is retried on notify failure.
- **Dispatch:** business/tech/admin job → durable event → admin popup (guaranteed, not best-effort) → assign → accept.
- **Finance audit:** completed → preview → audit (locks the record, writes history) → any change requires an explicit, logged re-open.

## 13. Top 10 Recommendations (ranked)
1. Rotate all secrets and stop sharing them across environments/apps. (P0-1)
2. Add Sentry/Crashlytics + real SOS health/alerting. (P0-2)
3. Make technician-earnings completion atomic & idempotent. (P0-3)
4. Deploy production from a tagged git ref, not a laptop tree. (P0-4)
5. Lock finance audits + add audit history. (P1-1)
6. Rate-limit the three unthrottled privileged logins. (P1-2)
7. Fix technician iOS push and un-commit/restrict all client keys. (P1-4)
8. Introduce a CI test gate covering SOS e2e, proximity completion, RBAC, OTP, audit-lock. (§7)
9. Make cross-API dispatch notifications durable with retry + earnings reconciliation. (P1-5)
10. Refactor sockets to per-user rooms before any horizontal scaling. (P1-6)

## 14. Technical Debt (top items)
Non-atomic money/status writes; shared mongoose-version skew; per-process socket maps; duplicated job lifecycle (REST vs socket) and business web-vs-Flutter logic; copy-pasted DataTable; 1,200-line admin components; emit-after-await Flutter crash pattern; ad-hoc backfill scripts in lieu of migrations; runtime-mutated `railway.toml`; hardcoded laptop paths in ops scripts; scratch files committed to landing.

---

*Prepared from static source inspection of the staged working tree. Items marked UNVERIFIED (Maps-key restriction, Azure upload validation, live production endpoint behaviour, git history) require a live environment or repo-history check to confirm. No code was modified during this audit.*
