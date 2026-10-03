# Cursor Composer 2.5 — Fix Prompts for Clicks Audit

How to use: paste ONE prompt at a time into Composer. Do them in order (P0 → P1 → P2).
Keep each in its own Composer session/checkpoint so you can review and revert per fix.
`@file` mentions help Composer target the right code — adjust paths if your tree differs.

Legend:
- 🟢 Code-only — Composer can fully do this.
- 🟡 Code + human — Composer writes code; YOU must also do an ops step (rotate a key, set a DSN, etc.).
- 🔴 Mostly human/ops — Composer can only scaffold; the real fix is outside the editor.

============================================================
PHASE 0 — EMERGENCY (do before any cohort beyond dogfood)
============================================================

------------------------------------------------------------
P0-3 🟢 Fix the technician-earnings double-credit race
------------------------------------------------------------
In @clicks-api/clicks-customer-tech-api/src/controllers/jobController.js the `markCompleted`
function guards against double completion with a non-atomic read-then-write: it checks
`if (job.job_status === "completed") return`, then later does `job.save()` and unconditionally
`$inc`s total_earned / cash_balance / weekly buckets on TechnicianEarnings. Two concurrent
requests (double-tap, client retry, at-least-once network) can both pass the guard and credit twice.

Make the completion transition atomic so earnings are credited at most once:
1. Replace the read-then-write status flip with a single atomic guard, e.g.
   `const job = await Job.findOneAndUpdate({ _id: id, job_status: "in_progress" }, { $set: { job_status: "completed", completed_at: new Date() } }, { new: true })`
   after the access/payment/signature validations. If it returns null, the job was not in
   `in_progress` (already completed or wrong state) — return the existing idempotent 200
   ("Job already completed") without crediting anything.
2. Only run the TechnicianEarnings `$inc`, weekly-bucket update, partner accrual, and receipt
   creation when the atomic update actually matched a document.
3. Preserve all existing validations (assertJobAccess, payment_status === "paid",
   customer signature required) — run them before the atomic flip.
Do not change the response shapes. Keep behaviour identical for the happy path; only the
concurrency semantics change. Show me the diff for just this function.

Acceptance: a second concurrent/duplicate POST to complete the same job credits earnings zero
additional times. Explain in your summary why the new flow is race-safe.

------------------------------------------------------------
P0-3b 🟢 (stronger) Add a per-job earnings ledger guard
------------------------------------------------------------
Optional hardening on top of P0-3. In @clicks-api/clicks-shared/models/TechnicianEarnings.js
there is no per-job idempotency guard, unlike PartnerEarning.job which is `unique: true`.
Add a lightweight ledger so a job can never be credited twice even across process restarts:
- Add a subdocument array or a separate `TechnicianEarningEntry` model with fields
  { technician_id, job_id (unique), amount, created_at } and a UNIQUE index on job_id.
- In markCompleted, insert the ledger row first; if the unique index throws a duplicate-key
  error, skip the aggregate `$inc` entirely (already credited).
Wire it in @clicks-api/clicks-customer-tech-api/src/controllers/jobController.js.
Acceptance: crediting is idempotent by job_id at the database level. Provide a migration note
for existing data (no backfill of the ledger is required; it only guards future completions).

------------------------------------------------------------
P0-2a 🟡 Deepen the health checks (real readiness)
------------------------------------------------------------
Both `/api/health` handlers return a static {status:"ok"} that passes even when MongoDB or the
socket adapter is down. Edit @clicks-api/clicks-admin-api/src/index.js and
@clicks-api/clicks-customer-tech-api/src/index.js so /api/health verifies real dependencies:
- Check `mongoose.connection.readyState === 1`; if not, return HTTP 503 with { status: "degraded",
  db: "down" }.
- On the tech-api, also report socketAdapter (already present) and, if REDIS_URL is set, a quick
  Redis ping; return 503 if Redis is configured but unreachable.
- Keep a separate always-200 `/api/health/live` liveness endpoint (process is up) distinct from
  `/api/health` readiness, so Railway can be pointed at the right one.
Acceptance: with the DB disconnected, /api/health returns 503. Tell me which Railway health-check
path I should switch to (readiness) after this change.

------------------------------------------------------------
P0-2b 🟡 Initialise Sentry in both APIs
------------------------------------------------------------
Sentry is in package-lock.json but never initialised. Add real error tracking to both APIs.
- Add @sentry/node init at the top of @clicks-api/clicks-admin-api/src/index.js and
  @clicks-api/clicks-customer-tech-api/src/index.js, gated on `process.env.SENTRY_DSN` (no-op if
  unset, so local dev is unaffected).
- Add Sentry's Express error handler BEFORE the existing `errorHandler` in the middleware chain.
- Capture the request id from the existing observability middleware as a Sentry tag so errors
  correlate with the JSON logs.
- Add SENTRY_DSN to the env example files in @clicks-api/ops/env/ (as a placeholder, never a real value).
Acceptance: unhandled errors reach Sentry when SENTRY_DSN is set; nothing changes when it is unset.
HUMAN STEP (not code): create the Sentry project and set SENTRY_DSN in Railway for both services.

------------------------------------------------------------
P0-1 🟡 Stop committing/reusing secrets (code + config hygiene)
------------------------------------------------------------
Do NOT paste any real secret into this task. This is about hygiene, not rotation.
1. In the root @.gitignore and @clicks-api/.gitignore, confirm coverage for: **/.env,
   **/.env.*, SECRETS.TRANSFER.md, **/google-services.json, **/GoogleService-Info.plist,
   **/*firebase*adminsdk*.json, **/*service*account*.json, **/local.properties, release-apks/.
   Add anything missing.
2. Search the repo for committed secrets/keys tracked by git (google-services.json,
   GoogleService-Info.plist, local.properties with GOOGLE_MAPS_API_KEY, any AIza… literals in
   dart/Info.plist/strings.xml) and list every tracked path — do NOT print the secret values,
   just the file paths and a one-line description.
3. For each Flutter Maps key currently hardcoded, propose reading it from a --dart-define / native
   build config instead, and show the code change (leave the value blank/placeholder).
Acceptance: give me (a) the updated .gitignore diffs and (b) a checklist of tracked files I must
`git rm --cached` and rotate. Do not attempt to rotate keys yourself.
HUMAN STEPS (not code): rotate ALL secrets (Atlas password, JWT_SECRET, JWT_REFRESH_SECRET,
INTERNAL_API_SECRET, SMSala token, Google Maps key, both Firebase service-account keys); give each
environment distinct values (admin+tech JWT/internal secrets matched to each other but unique per
env); move them into Railway/Vercel secret stores; delete SECRETS.TRANSFER.md; restrict the Maps
key by HTTP referrer / app bundle id; scrub git history if any secret was ever committed.

------------------------------------------------------------
P0-4 🔴 Traceable production deploys (CI scaffold)
------------------------------------------------------------
Production is deployed by `railway up` from a local working tree, so prod runs code in no git ref,
and the deploy scripts rewrite railway.toml in place. Scaffold a git-ref-based deploy:
1. Add a GitHub Actions workflow `.github/workflows/deploy-production.yml` that triggers on a
   version tag (e.g. v*), builds each service from the tagged commit, and deploys to Railway using
   the Railway CLI/API with a token from GitHub secrets — for BOTH clicks-admin-api and
   clicks-tech-api, each using its own Dockerfile without mutating a shared railway.toml at runtime.
2. Record the deployed commit SHA (inject as an env var or Sentry release).
3. Leave the existing manual scripts in place but add a comment marking them deprecated.
Do not include any secret values; reference GitHub secrets by name only.
Acceptance: show me the workflow file and tell me exactly which GitHub secrets and Railway
settings I must create. Flag clearly that per-service Railway config must replace the runtime
railway.toml rewrite.
HUMAN STEPS: commit the entire working tree first (including clicks-finance-web, currently
untracked), create Railway deploy tokens, configure the two services with fixed Dockerfiles.

============================================================
PHASE 1 — PRODUCTION READINESS
============================================================

------------------------------------------------------------
P1-1 🟢 Lock finance audits (make them immutable + history)
------------------------------------------------------------
In @clicks-api/clicks-admin-api/src/controllers/financePortalController.js the `auditJob` and
`updateFinance` functions never check whether a job is already audited, so an audited job's
finance_revenue / finance_net_profit / finance_audited_by can be silently overwritten and repair
costs re-edited. Enforce immutability:
1. In both auditJob and updateFinance, if `job.finance_status === "audited"`, reject with HTTP 409
   { message: "Job already audited and locked" } — unless an explicit, separately-authorised
   re-open path is used (see step 3).
2. Add an append-only audit history: create a `FinanceAuditLog` model
   { job_id, action ("audit"|"update"|"reopen"), finance_revenue, finance_cost_total,
   finance_net_profit, finance_user_id, at } and write a row on every finance mutation. Never
   update-in-place; always insert.
3. Add an optional `reopenAudit` controller + route `POST /api/finance/jobs/:id/reopen` guarded by
   authenticateFinance that flips finance_status back to "pending", logs a "reopen" history row,
   and (for now) is allowed for any finance user — leave a TODO to restrict to a senior role.
Update @clicks-api/clicks-admin-api/src/routes/financePortal.js accordingly.
Acceptance: a second audit of an audited job returns 409; every finance change appends a history
row; reopening is logged. Keep existing preview/compute logic (financeJobPreview) unchanged.

------------------------------------------------------------
P1-2 🟢 Rate-limit the three unthrottled privileged logins
------------------------------------------------------------
`authLimiter` protects admin login and customer/technician OTP, but the business, finance, and
partner logins have none. Apply the existing limiter:
- @clicks-api/clicks-admin-api/src/routes/businessPortal.js → wrap `POST /auth/login`
- @clicks-api/clicks-admin-api/src/routes/financePortal.js → wrap `POST /auth/login`
- @clicks-api/clicks-admin-api/src/routes/partnerPortal.js → wrap `POST /login`
Import authLimiter from @clicks-api/clicks-admin-api/src/middleware/rateLimiter.js. If that
limiter is only exported from the tech-api copy, create/point to the admin-api rateLimiter module
so all three admin-api portal logins share one limiter (10 attempts / 15 min / IP, matching admin).
Keep the `skip: () => NODE_ENV === "test"` behaviour.
Acceptance: the 11th login attempt from one IP within 15 min returns 429 on all three portals.

------------------------------------------------------------
P1-3 🟢 Web session hardening (admin/business/finance portals)
------------------------------------------------------------
Fix three session issues across the React portals:
1. Admin token refresh only fires on HTTP 403, never 401. In
   @clicks-interface/src/store/apiSlice.js, trigger the refresh flow on 401 as well as 403, and if
   refresh fails, dispatch logout. Align this with the business/finance portals (which logout on 401).
2. Admin logout is client-only. In @clicks-interface/src/components/AdminSidebar.jsx handleLogout,
   call the existing `/auth/logout` mutation (from authApi.js) to revoke the refresh token
   server-side BEFORE clearing local state and navigating.
3. Add a "Session expired" toast/message on 401-driven logout in the business and finance portals
   (@clicks-business-web and @clicks-finance-web) instead of a silent redirect to /login.
Do NOT change where tokens are stored in this task (that's a larger cookie migration — leave a
TODO comment noting localStorage → httpOnly cookie as follow-up).
Acceptance: expired access token → refresh attempt → clean logout if refresh fails; admin logout
revokes the refresh token; business/finance show a session-expired message.

------------------------------------------------------------
P1-3b 🟢 Remove/guard the open /demo route and sanitise HTML sinks
------------------------------------------------------------
In @clicks-interface/src/App.jsx the `/demo` route renders inside AdminLayout with no
ProtectedRoute wrapper, exposing the admin shell to unauthenticated visitors. Either delete the
route or wrap it in ProtectedRoute like the others.
Separately, @clicks-interface/src/pages/PrivacyPolicyPage.jsx and TermsAndConditionsPage.jsx use
`dangerouslySetInnerHTML` on API-provided HTML with no sanitisation. Add DOMPurify and sanitise
the content before rendering.
Acceptance: /demo is no longer reachable unauthenticated; both policy pages sanitise HTML.

------------------------------------------------------------
P1-4a 🟢 Flutter: move JWTs to secure storage (all 4 apps)
------------------------------------------------------------
All four Flutter apps store the auth token in SharedPreferences (plaintext) via CacheHelper.
Migrate token storage to flutter_secure_storage while leaving non-sensitive prefs in
SharedPreferences.
Apps: @clicks-technician, @clicks-user, @clicks-business, @clicks-partner.
- Add flutter_secure_storage to each pubspec.yaml.
- In each app's core/helper/cache_helper.dart, add secure get/set/delete for the "token" key (and
  any refresh token / fcm-related secrets) backed by flutter_secure_storage; keep the existing
  SharedPreferences API for non-secret values.
- Update the login cubits/screens that currently save the token to use the secure path, and update
  every read site (Dio interceptors, socket setAuth) to read from secure storage.
Do ONE app fully, show me the diff, then I'll tell you to repeat for the others (so I can review
the pattern once). Acceptance: no auth token is written to SharedPreferences; app still logs in,
calls APIs, and connects sockets.

------------------------------------------------------------
P1-4b 🟢 Technician app: fix iOS push + camera + socket reconnect
------------------------------------------------------------
In @clicks-technician:
1. iOS push is non-functional: there is no ios/Runner/GoogleService-Info.plist and Info.plist
   lacks the `remote-notification` UIBackgroundMode. Add the background mode entry and add a clear
   TODO/placeholder for the GoogleService-Info.plist (I will drop in the real file). Ensure the FCM
   setup in lib/core/notifications/job_notification_service.dart is iOS-complete (APNS token
   handling, onTokenRefresh re-register).
2. iOS will crash on camera use — Info.plist has no NSCameraUsageDescription /
   NSPhotoLibraryUsageDescription. Add both with sensible Qatar-market copy.
3. The technician socket in lib/core/sos_services/technician_socket_service.dart is built with
   disableAutoConnect() but no reconnection settings, unlike the customer socket. Enable
   reconnection (enableReconnection, attempts, delay) and re-register + re-join on reconnect so
   job-lifecycle events aren't lost mid-job. Mirror the resilient pattern from
   @clicks-user/lib/core/sos_services/customer_socket_service.dart.
Acceptance: iOS declares remote-notification + camera/photo usage strings; technician socket
auto-reconnects and re-registers. Note clearly that I still must add the real GoogleService-Info.plist.

------------------------------------------------------------
P1-4c 🟢 Partner app: notifications permission + background FCM
------------------------------------------------------------
In @clicks-partner:
1. android/app/src/main/AndroidManifest.xml declares only INTERNET. Add POST_NOTIFICATIONS (and any
   other permissions the FCM flow needs) so Android 13+ can actually show notifications.
2. lib/core/notifications/partner_notification_service.dart handles only onMessage (foreground) with
   an empty onMessageOpenedApp. Add a top-level onBackgroundMessage handler, getInitialMessage
   (killed-state tap routing), and onTokenRefresh re-registration.
Acceptance: partner app requests notification permission on Android 13+, and background/killed
notifications route correctly and refresh their token.

------------------------------------------------------------
P1-4d 🟢 Flutter: fail-closed release builds (business + partner)
------------------------------------------------------------
@clicks-business and @clicks-partner default ENV to "staging" whose base URL is
`http://10.0.2.2:5000` (emulator localhost), so a plain `flutter build` ships a dead app.
In each app's core/config/app_config.dart:
- Make production the default, OR make the build fail/throw at startup if no valid API_BASE_URL is
  provided via --dart-define (fail-closed rather than silently pointing at localhost).
- Remove cleartext http:// production defaults; require https for non-local.
Acceptance: a release build with no dart-defines either targets production or refuses to run,
never silently targets localhost.

------------------------------------------------------------
P1-4e 🟢 Flutter: guard emit/setState after await (crash fix)
------------------------------------------------------------
Across the Flutter apps, cubits emit after `await` with no isClosed guard (notably
@clicks-user/lib/core/sos_services/sos_cubit.dart — the emergency flow — and technician home_cubit,
business login_cubit). This throws "Cannot emit after close" if the screen is dismissed mid-request.
Add `if (isClosed) return;` before every emit that follows an await in these cubits (and
`if (!mounted) return;` before setState in any StatefulWidget doing the same). Start with
sos_cubit.dart, show me the diff, then extend to the others.
Acceptance: no emit/setState occurs after close/dispose on any awaited path in the touched files.

------------------------------------------------------------
P1-5 🟢 Durable dispatch notifications + earnings reconciliation
------------------------------------------------------------
Cross-API dispatch notifications are best-effort: @clicks-api/clicks-admin-api/src/controllers/
businessPortalController.js posts to the tech-api internal notify endpoint inside try/catch and
continues on failure, so a momentary tech-api outage silently drops the admin popup; partner
accrual in @clicks-api/clicks-shared/services/partnerService.js similarly logs-and-continues.
Add a minimal durable outbox:
1. Create an `OutboxEvent` model { type, payload, status ("pending"|"sent"|"failed"), attempts,
   next_attempt_at, created_at }.
2. When a cross-API notify or partner accrual fails, enqueue an OutboxEvent instead of only logging.
3. Add a small interval worker (in the admin-api bootstrap) that retries pending events with
   backoff and marks them sent/failed; cap attempts and log to Sentry on final failure.
Keep the happy path unchanged (still try the direct call first; only enqueue on failure).
Acceptance: killing tech-api during a business job create results in a pending OutboxEvent that is
delivered on retry; no dispatch is silently lost. Provide the model + worker + wiring diffs.

------------------------------------------------------------
P1-6 🟡 Socket rooms so Redis actually scales (bigger refactor)
------------------------------------------------------------
Realtime targeting in @clicks-api/clicks-customer-tech-api/src/services/sosSocketService.js uses
per-process in-memory Maps (technicianSockets, customerSockets keyed by user id), so with
TECH_API_INSTANCES > 1 a user on instance A misses events emitted from instance B — the Redis
adapter alone does not fix this.
Refactor to Socket.IO rooms:
- On register, `socket.join('user:' + id)` (and role-specific rooms as needed) instead of storing
  the socket id in a Map.
- Replace every `customerNamespace.to(customerSockets.get(id)).emit(...)` (and technician/admin
  equivalents) with `namespace.to('user:' + id).emit(...)`.
- Keep identity from the JWT (socket.user) — do not trust client-supplied ids.
- Preserve all existing events, payloads, and access checks (assertSocketJobAccess etc.).
This is a substantial change — do it in one file, keep event contracts identical, and show me a
full diff plus a short note on what I must set (REDIS_URL + sticky sessions) before scaling
instances. Acceptance: no per-user socket-id Maps remain for targeting; all emits go via rooms.

============================================================
PHASE 2 — HARDENING (representative prompts)
============================================================

------------------------------------------------------------
P2-1 🟢 Minimal CI test gate for the critical journeys
------------------------------------------------------------
CI currently runs no real tests (the "start APIs" step is `node -e "console.log('deps ok')"`).
Add real integration tests and wire them into @clicks-api/.github/workflows/ci.yml, running
against an ephemeral MongoDB (e.g. mongodb-memory-server) — NOT production.
Cover, at minimum:
- Customer SOS create → broadcast → claim (socket + REST).
- Technician accept → arrived → start (proximity gate enforced) → complete (paid + signature),
  and assert earnings are credited exactly once even on a duplicate complete call.
- Finance audit locks the record (second audit → 409).
- RBAC: an ops-role token is rejected (403) on a requireFullAdmin route.
- OTP: wrong code increments attempts, caps out, and a Mongo-operator payload cannot match a code.
Replace the no-op smoke step with `npm test`. Acceptance: CI fails if any of these regress; no
test touches a production endpoint or sends real SMS.

------------------------------------------------------------
P2-2 🟢 Atomic money/status transitions via transactions
------------------------------------------------------------
Wrap the multi-document money/status writes (job completion + TechnicianEarnings + partner accrual
+ receipt) in a MongoDB transaction (session) in @clicks-api/clicks-customer-tech-api/src/
controllers/jobController.js and @clicks-api/clicks-shared/services/partnerService.js, so a partial
failure cannot leave earnings credited without a completed job or vice versa. Guard for standalone
Mongo (transactions need a replica set — Atlas is fine) with a clear error if unsupported.
Acceptance: completion + all downstream financial writes commit atomically or roll back together.

------------------------------------------------------------
P2-3 🟢 Unify job-status vocabulary across all surfaces
------------------------------------------------------------
The same status renders differently per surface (admin hardcodes "Technician assigned"/"Enroute";
business derives "Assigned"/"In Progress" generically). Create ONE shared status→label map and use
it everywhere:
- Add a canonical status label/color map (e.g. clicks-interface/src/utils/jobStatus.js and mirror
  it in business-web/finance-web, or a copied constant if there's no shared web package).
- Replace the ad-hoc label logic in @clicks-business-web/src/utils/phone.js (statusLabel) and the
  hardcoded strings in @clicks-interface/src/pages/JobManagement/Jobs.jsx with the shared map.
Acceptance: assigned/en_route/in_progress/completed/cancelled render identically across admin,
business, and finance portals.

------------------------------------------------------------
P2-4 🟢 Admin audit logging (who/what/when on jobs)
------------------------------------------------------------
There is no attributable audit trail for admin actions on jobs (edit, dispatch, cancel). Add an
`AdminAuditLog` model { admin_id, admin_role, action, entity_type, entity_id, before, after, ip, at }
and write a row from the admin-api job controller on update/dispatch/cancel/delete. Capture ip from
the request (trust proxy is already set). Add a read endpoint guarded by requireFullAdmin.
Acceptance: "who cancelled job X, when, from where" is answerable from the log.

============================================================
NOTES
============================================================
- After P0-1/P0-4, commit the whole working tree (the finance portal is currently untracked) so
  Composer and CI operate on the real code.
- Prompts marked 🟡/🔴 need the human/ops steps called out inside them — Composer cannot rotate a
  secret, create a Sentry project, or configure Railway/Vercel.
- Review each fix's diff before accepting; keep them in separate commits so a bad change is easy to
  revert.
