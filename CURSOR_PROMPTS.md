# Cursor Composer 2.5 — Ready-to-Paste Prompts

Each block below is one complete, self-contained prompt. Copy the whole block (everything inside the fences), paste it into Composer, let it finish, review the diff, commit, then move to the next. Order matters: Prompt 1 → 16.

---

## Prompt 1 — Fix technician-earnings double-credit race (P0)

```
You are working in the Clicks roadside-assistance monorepo. Fix a payment-integrity race condition in the job-completion endpoint.

CONTEXT
File: clicks-api/clicks-customer-tech-api/src/controllers/jobController.js, function markCompleted.
The current idempotency guard is a non-atomic read-then-write: it loads the job, checks `if (job.job_status === "completed") return`, then later calls `job.save()` and unconditionally runs `$inc` updates on the TechnicianEarnings collection (total_earned, cash_balance, performance.total_completed_jobs, plus a weekly_earnings bucket), partner accrual, and receipt creation. Two concurrent requests for the same job (double-tap, client retry, network at-least-once delivery) can both read job_status="in_progress", both pass the guard, and both credit the technician — paying them twice.

TASK
Make the completion transition atomic and the earnings credit happen at most once:
1. Keep all existing validations exactly as they are, in this order: job exists, assertJobAccess, payment_status === "paid", customerSignatureUrl and customerSignedAt present, and the completion_notes/completion_photos handling.
2. Replace the status flip with a single atomic compare-and-set:
   const updated = await Job.findOneAndUpdate(
     { _id: id, job_status: "in_progress" },
     { $set: { job_status: "completed", completed_at: new Date(), ...notes/photos fields } },
     { new: true }
   );
3. If `updated` is null, the job was not in "in_progress" at write time (already completed by a concurrent request, or wrong state). Re-read the job: if its status is "completed", return the existing idempotent 200 response { message: "Job already completed", job_status: "completed" } WITHOUT crediting anything. Otherwise return the existing 400 "Cannot complete job with status: ..." error.
4. Only when the atomic update matched a document, run the downstream effects: customer notify, partner accrual (accruePartnerFromCompletedJob), the TechnicianEarnings $inc and weekly-bucket updates, the Technician.performance sync, and the receipt-safety creation.
5. Do not change any response shapes, status codes, or event payloads. Only the concurrency semantics change.

ACCEPTANCE CRITERIA
- Two concurrent POSTs to complete the same job result in exactly one earnings credit; the loser gets the idempotent 200.
- All pre-existing validations still fire in the same order with the same error messages.
- In your summary, explain step by step why the new flow cannot double-credit.
```

---

## Prompt 2 — Per-job earnings ledger with unique index (P0 hardening)

```
You are working in the Clicks roadside-assistance monorepo. Add a database-level idempotency guard so a job can never credit technician earnings twice, even across process restarts or code regressions.

CONTEXT
clicks-api/clicks-shared/models/TechnicianEarnings.js holds aggregate totals per technician but has NO per-job record, so nothing at the DB layer prevents the same job from being credited twice. By contrast, clicks-api/clicks-shared/models/PartnerEarning.js has a `job` field with `unique: true`, which makes partner accrual idempotent — copy that pattern.

TASK
1. Create a new model clicks-api/clicks-shared/models/TechnicianEarningEntry.js:
   - Fields: technician_id (ObjectId ref Technician, required, index), job_id (ObjectId ref Job, required, UNIQUE index), amount (Number, required), created_at (Date, default now).
   - Export it from clicks-api/clicks-shared/models/index.js alongside the other models.
2. In clicks-api/clicks-customer-tech-api/src/controllers/jobController.js markCompleted, inside the earnings block: FIRST insert the TechnicianEarningEntry row inside a try/catch. If the insert throws a MongoDB duplicate-key error (code 11000), skip the aggregate $inc, weekly-bucket update, and performance sync entirely — this job was already credited. Any other error should propagate as before.
3. Only when the ledger insert succeeds, run the existing aggregate updates unchanged.
4. No backfill is required for historical jobs — the ledger only guards future completions. Add a short code comment saying so.

ACCEPTANCE CRITERIA
- A unique index on job_id exists in the new schema.
- Replaying the completion flow for an already-credited job performs zero additional $inc operations.
- The happy path (first completion) produces exactly one ledger row plus the same aggregate updates as before.
```

---

## Prompt 3 — Real health checks: readiness vs liveness (P0)

```
You are working in the Clicks roadside-assistance monorepo. The health endpoints lie: they return a static 200 even when MongoDB or the socket adapter is down, and Railway health-checks them, so a dead API reports healthy.

CONTEXT
- clicks-api/clicks-admin-api/src/index.js defines GET /api/health returning a static { status: "ok" }.
- clicks-api/clicks-customer-tech-api/src/index.js defines GET /api/health returning { status: "ok", socketAdapter: "redis"|"memory" }.

TASK
In BOTH index.js files:
1. Keep a liveness endpoint GET /api/health/live that always returns 200 { status: "ok" } if the process is up.
2. Convert GET /api/health into a readiness check:
   - Verify mongoose.connection.readyState === 1. If not, respond HTTP 503 with { status: "degraded", db: "down" }.
   - On the tech-api, keep reporting socketAdapter. If process.env.REDIS_URL is set, do a fast Redis ping (reuse the client from utils/socketAdapter.js if accessible; otherwise a lightweight check) with a ~1s timeout; if Redis is configured but unreachable, respond 503 with { status: "degraded", redis: "down" }.
   - When healthy, respond 200 with { status: "ok", db: "up", socketAdapter: ... }.
3. Do not add heavy dependencies; use what is already installed.
4. Add a comment above each endpoint noting that Railway's health-check path should point at /api/health (readiness).

ACCEPTANCE CRITERIA
- With the DB disconnected, GET /api/health returns 503 on both APIs while /api/health/live still returns 200.
- Healthy responses include db and (tech-api) socketAdapter fields.
- Your summary tells me exactly what to change in the Railway service settings.
```

---

## Prompt 4 — Initialise Sentry error tracking in both APIs (P0)

```
You are working in the Clicks roadside-assistance monorepo. Sentry appears in package-lock.json but is never initialised — production errors on a life-safety SOS product currently go nowhere.

CONTEXT
- Entry points: clicks-api/clicks-admin-api/src/index.js and clicks-api/clicks-customer-tech-api/src/index.js.
- Both already use a shared observability middleware (clicks-api/clicks-shared/middleware/observability.js) that assigns a request id and a final errorHandler.
- Env example files live in clicks-api/ops/env/.

TASK
1. Add @sentry/node to both APIs' package.json (align on one current major version).
2. In both index.js files, initialise Sentry at the very top, gated on process.env.SENTRY_DSN — if unset, everything must be a complete no-op so local dev is unaffected. Set environment from process.env.NODE_ENV and release from process.env.GIT_SHA if present.
3. Install Sentry's Express request handler early in the middleware chain and its error handler immediately BEFORE the existing shared errorHandler, so Sentry captures the error and the existing JSON error response still goes out unchanged.
4. Tag each captured event with the request id from the observability middleware (read it from wherever requestContext stores it — res.locals or req) so Sentry events correlate with the JSON logs.
5. In the tech-api, also capture errors thrown inside Socket.IO handlers: add Sentry.captureException in the catch blocks of clicks-api/clicks-customer-tech-api/src/services/sosSocketService.js that currently only console.error (do not change any handler behaviour).
6. Add SENTRY_DSN= (empty placeholder) to each file in clicks-api/ops/env/ that configures an API. Never write a real DSN or any real secret.

ACCEPTANCE CRITERIA
- With SENTRY_DSN unset, both APIs boot and behave exactly as before.
- With SENTRY_DSN set, an unhandled route error and a socket-handler error both reach Sentry, tagged with the request id where applicable.
- Response bodies and status codes are unchanged.
```

---

## Prompt 5 — Secrets hygiene sweep (P0 — code part only)

```
You are working in the Clicks roadside-assistance monorepo. Perform a secrets-hygiene sweep. IMPORTANT: never print, echo, or move any actual secret value in your output or in any file you write — refer to secrets only by file path and type.

CONTEXT
Live credentials have been handled loosely in this repo: a root-level SECRETS.TRANSFER.md holds production values; Flutter apps commit google-services.json, ios/Runner/GoogleService-Info.plist, android/local.properties containing GOOGLE_MAPS_API_KEY, and at least one Maps key hardcoded in clicks-user/ios/Runner/Info.plist.

TASK
1. Audit the root .gitignore and clicks-api/.gitignore. Ensure ALL of these patterns are covered, adding any that are missing: **/.env, **/.env.*, !**/.env.example, SECRETS.TRANSFER.md, **/SECRETS.TRANSFER.md, **/google-services.json, **/GoogleService-Info.plist, **/*firebase*adminsdk*.json, **/*service*account*.json, **/local.properties, release-apks/.
2. Search the whole repo for files that contain credential material (patterns: AIza[A-Za-z0-9_-]{30,}, BEGIN PRIVATE KEY, mongodb+srv://, SMSALA, JWT_SECRET=, INTERNAL_API_SECRET=). Produce a table in your summary listing ONLY: file path, secret type, and whether the file matches a gitignore rule. Do not quote values.
3. In clicks-user/ios/Runner/Info.plist, replace the hardcoded GOOGLE_MAPS_API_KEY value with a build-setting reference ($(GOOGLE_MAPS_API_KEY)) and add the corresponding entry to the xcconfig / build configuration so the key is injected at build time. Do the same pattern for any other hardcoded AIza key you find in Dart, AndroidManifest.xml, or strings.xml across clicks-technician, clicks-user, clicks-business, clicks-partner — the committed value must be replaced by an injected placeholder.
4. Do NOT delete SECRETS.TRANSFER.md or any credential file yourself, and do not attempt any rotation.

ACCEPTANCE CRITERIA
- Updated .gitignore diffs cover every pattern above.
- Your summary contains the audit table plus a numbered manual checklist for me: which files to `git rm --cached`, which keys/passwords to rotate (Atlas, JWT_SECRET, JWT_REFRESH_SECRET, INTERNAL_API_SECRET, SMSala, Google Maps, both Firebase service accounts), and where each key must be restricted (HTTP referrer for web, bundle id / package name + SHA-1 for mobile).
- No secret value appears anywhere in your output or diffs.
```

---

## Prompt 6 — Tag-based production deploy workflow (P0 scaffold)

```
You are working in the Clicks roadside-assistance monorepo. Production is currently deployed by running `railway up` from a developer laptop, which uploads the local working tree — production runs code that exists in no git ref, and the deploy scripts rewrite railway.toml in place to switch Dockerfiles, relying on a finally-block to restore it.

CONTEXT
- Existing scripts: clicks-api/ops/deploy-admin-api-production.ps1, clicks-api/ops/deploy-tech-api-production.ps1, clicks-api/ops/retry-tech-deploy.ps1 (this one hardcodes C:\Users\TS\Downloads\clicks-api).
- Dockerfiles: clicks-api/Dockerfile.admin-api and clicks-api/Dockerfile.tech-api.
- Existing CI: clicks-api/.github/workflows/ci.yml (Gitleaks + a no-op smoke).
- Railway project: melodious-achievement, services clicks-admin-api and clicks-tech-api.

TASK
1. Create .github/workflows/deploy-production.yml at the REPO ROOT (not inside clicks-api) that:
   - Triggers on push of tags matching v* and via workflow_dispatch.
   - Has two jobs, deploy-admin-api and deploy-tech-api, each checking out the tagged commit and deploying its service with the Railway CLI using a RAILWAY_TOKEN from GitHub secrets, targeting the correct service by name with its own Dockerfile — WITHOUT modifying railway.toml at runtime (pass the service/Dockerfile via CLI flags or per-service config).
   - Exports the tagged commit SHA as GIT_SHA to the deployed environment (so Sentry releases and logs can carry it).
   - Fails loudly if the tag does not point at a commit on main.
2. Add a comment header to each existing deploy-*.ps1 marking it DEPRECATED in favour of the workflow, without deleting them.
3. Reference secrets by name only (secrets.RAILWAY_TOKEN); never inline a value.

ACCEPTANCE CRITERIA
- The workflow file is valid GitHub Actions YAML and never edits railway.toml.
- Your summary lists exactly what I must create: the GitHub secret(s), any Railway service settings, and the release procedure (commit → tag → push tag).
- You explicitly remind me that the current working tree has uncommitted changes (including the untracked clicks-finance-web) that must be committed before this pipeline means anything.
```

---

## Prompt 7 — Lock finance audits: immutability + append-only history (P1)

```
You are working in the Clicks roadside-assistance monorepo. Audited financial records are silently overwritable — fix that.

CONTEXT
File: clicks-api/clicks-admin-api/src/controllers/financePortalController.js. Neither updateFinance (PATCH /api/finance/jobs/:id/finance) nor auditJob (POST /api/finance/jobs/:id/audit) checks whether job.finance_status is already "audited". Re-calling audit overwrites finance_revenue, finance_cost_total, finance_net_profit, finance_audited_by, and finance_audited_at with no trace; updateFinance can still mutate repair costs on an audited job. Routes are in clicks-api/clicks-admin-api/src/routes/financePortal.js, guarded by authenticateFinance. The Job finance fields live in clicks-api/clicks-shared/models/Job.js.

TASK
1. In BOTH updateFinance and auditJob: if job.finance_status === "audited", respond HTTP 409 { message: "Job is audited and locked. Reopen it first." } and make no writes.
2. Create clicks-api/clicks-shared/models/FinanceAuditLog.js — an append-only log:
   - Fields: job_id (ObjectId ref Job, required, index), action (enum: "update" | "audit" | "reopen", required), finance_revenue, finance_cost_total, finance_net_profit (Numbers, nullable), finance_user_id (ObjectId ref FinanceUser, required), notes (String, maxlength 2000), at (Date, default now).
   - Export from clicks-shared/models/index.js. Rows are only ever inserted, never updated or deleted.
3. Write one FinanceAuditLog row on every successful updateFinance ("update"), auditJob ("audit"), and reopen ("reopen"), capturing the post-write figures and req.financeUser._id.
4. Add reopenAudit: POST /api/finance/jobs/:id/reopen (authenticateFinance) that only works on an audited job, sets finance_status back to "pending", clears nothing else, logs a "reopen" row, and returns the job's new state. Add a TODO comment: restrict reopen to a senior finance role once roles exist.
5. Add GET /api/finance/jobs/:id/history (authenticateFinance) returning the FinanceAuditLog rows for that job, newest first.
6. Leave computeFinancePreview and all pricing logic untouched.

ACCEPTANCE CRITERIA
- Audit → second audit returns 409. Audit → reopen → audit succeeds and produces three history rows (audit, reopen, audit).
- updateFinance on an audited job returns 409 and changes nothing, including repair costs.
- History endpoint returns attributable rows (who, what figures, when).
```

---

## Prompt 8 — Rate-limit business, finance, and partner logins (P1)

```
You are working in the Clicks roadside-assistance monorepo. Three privileged password logins have no rate limiting while admin login and customer/technician OTP do.

CONTEXT
- clicks-api/clicks-admin-api/src/middleware/rateLimiter.js exports authLimiter (express-rate-limit: 10 attempts / 15 min / IP, standardHeaders, skip when NODE_ENV === "test"). It is applied in routes/auth.js only.
- Unprotected endpoints, all in clicks-admin-api:
  - POST /auth/login in src/routes/businessPortal.js
  - POST /auth/login in src/routes/financePortal.js
  - POST /login in src/routes/partnerPortal.js
- app.set("trust proxy", 1) is already configured in src/index.js, so req.ip is correct behind Railway.

TASK
1. Import authLimiter into the three route files and insert it as the first middleware on each of those login routes.
2. Also apply it to any password-reset or OTP-request endpoints you find in those same three route files (check for /forgot, /reset, /otp paths); list in your summary which ones you covered.
3. Change nothing else — same handlers, same paths, same response shapes.

ACCEPTANCE CRITERIA
- The 11th failed login within 15 minutes from one IP returns 429 with the limiter's message on all three portals.
- Admin login behaviour is unchanged.
- Tests skip the limiter via the existing NODE_ENV === "test" escape hatch.
```

---

## Prompt 9 — Web session hardening across the three portals (P1)

```
You are working in the Clicks roadside-assistance monorepo. Fix three session-handling defects across the React portals. Do NOT migrate token storage in this task — leave a TODO comment where tokens are persisted noting "follow-up: move to httpOnly cookies".

CONTEXT & DEFECTS
1. Admin portal (clicks-interface): the silent token-refresh in src/store/apiSlice.js only triggers on HTTP 403. An expired access token that returns 401 neither refreshes nor logs out — requests just fail silently.
2. Admin portal: logout is client-only. src/components/AdminSidebar.jsx handleLogout dispatches logout() and navigates, but never calls the /auth/logout mutation that already exists in src/store/authApi.js — so the refresh token is never revoked server-side.
3. Business (clicks-business-web) and finance (clicks-finance-web) portals: src/store/apiSlice.js logs out on 401 but silently redirects to /login with no explanation.

TASK
1. In clicks-interface/src/store/apiSlice.js: run the refresh-and-retry flow on BOTH 401 and 403. If the refresh itself fails (or there is no refresh token), dispatch logout and let the redirect happen.
2. In clicks-interface AdminSidebar handleLogout: call the logout mutation (fire-and-forget with a short await + catch so a dead API can't block logout), THEN clear local state and navigate. Verify the server route it hits actually invalidates the refresh token; if the backend /auth/logout is a stub that invalidates nothing, say so explicitly in your summary.
3. In business and finance portals: on 401-driven logout, surface a visible "Your session expired — please sign in again" message on the login screen (route state, query param, or a lightweight toast — match each portal's existing patterns).
4. Keep all other request/response behaviour identical.

ACCEPTANCE CRITERIA
- Admin: expired token → refresh attempt → either seamless retry or clean logout; no silent dead UI.
- Admin logout performs a server call before clearing state.
- Business/finance users see a session-expired message instead of an unexplained bounce to /login.
```

---

## Prompt 10 — Close /demo and sanitise HTML sinks in the admin portal (P1)

```
You are working in the Clicks roadside-assistance monorepo, in the admin portal clicks-interface.

DEFECTS
1. In src/App.jsx, the path="/demo" route renders inside AdminLayout WITHOUT a ProtectedRoute wrapper — any unauthenticated visitor gets the admin shell.
2. src/pages/PrivacyPolicyPage.jsx (line ~56) and src/pages/TermsAndConditionsPage.jsx (line ~56) render API-provided HTML via dangerouslySetInnerHTML with no sanitisation — a stored-XSS sink if that content is ever writable by a lower-privilege path.

TASK
1. Decide /demo's fate: if nothing imports or links to it besides the route definition, DELETE the route and its page component; otherwise wrap it in ProtectedRoute exactly like the neighbouring routes. State which you did and why.
2. Add dompurify to package.json. In both policy pages, sanitise the HTML with DOMPurify.sanitize(content) before passing it to dangerouslySetInnerHTML. Keep rendering behaviour otherwise identical (allow standard formatting tags; strip scripts/event handlers).

ACCEPTANCE CRITERIA
- /demo is not reachable without authentication (or is gone).
- A policy document containing <img src=x onerror=alert(1)> renders inert.
- No other routes or pages change.
```

---

## Prompt 11 — Flutter: migrate JWT to flutter_secure_storage (start with technician) (P1)

```
You are working in the Clicks roadside-assistance monorepo, Flutter app clicks-technician. The auth JWT is stored in SharedPreferences (plaintext, included in device backups, trivially readable on a rooted device). Migrate token storage to flutter_secure_storage. Do ONLY the technician app in this task — I will review the pattern before repeating it in clicks-user, clicks-business, and clicks-partner.

CONTEXT
- lib/core/helper/cache_helper.dart wraps SharedPreferences; the token is saved under key "token" (written by lib/features/login/ui/cubit/login_cubit.dart around line 48).
- The token is read for Dio Authorization headers and passed to the socket via setAuth({'token': token}) in lib/core/sos_services/technician_socket_service.dart.

TASK
1. Add flutter_secure_storage to pubspec.yaml (current stable version).
2. In cache_helper.dart, add async secureWrite/secureRead/secureDelete backed by FlutterSecureStorage. Keep the existing SharedPreferences API for non-sensitive values.
3. Route the auth token (and refresh token if one exists) exclusively through the secure API: update every write site (login, logout) and every read site (Dio interceptor/helper, socket auth, any splash/auto-login check). Search the whole lib/ for reads of the "token" key to catch stragglers.
4. One-time migration on startup: if a token exists in SharedPreferences, copy it to secure storage and delete it from SharedPreferences, so already-logged-in technicians are not logged out by the update.
5. On logout, delete the token from secure storage.
6. Configure sensible platform options (Android encryptedSharedPreferences: true; iOS default keychain accessibility).

ACCEPTANCE CRITERIA
- No code path writes or reads the auth token via plain SharedPreferences anymore (except the one-time migration read/delete).
- Fresh login, API calls, socket connect, app restart (auto-login), and logout all work.
- Existing sessions survive the upgrade via the migration.
```

---

## Prompt 12 — Technician app: iOS push, camera strings, socket reconnect (P1)

```
You are working in the Clicks roadside-assistance monorepo, Flutter app clicks-technician. Three field-reliability defects:

DEFECT A — iOS push is non-functional. There is no ios/Runner/GoogleService-Info.plist and ios/Runner/Info.plist's UIBackgroundModes contains only "location" — not "remote-notification". The FCM wiring exists in lib/core/notifications/job_notification_service.dart but can never deliver on iOS.
DEFECT B — iOS camera crash. The app uses ImagePicker with ImageSource.camera (registration flow, home_cubit) but Info.plist has no NSCameraUsageDescription or NSPhotoLibraryUsageDescription — first camera access hard-crashes and guarantees App Store rejection.
DEFECT C — the technician socket has no auto-reconnect. lib/core/sos_services/technician_socket_service.dart builds the socket with disableAutoConnect() and never enables reconnection, unlike the customer app (clicks-user/lib/core/sos_services/customer_socket_service.dart, which uses enableReconnection, high attempt count, delay, and websocket+polling transports). If the socket drops mid-job (tunnel, elevator), job-lifecycle events are silently lost until app resume.

TASK
1. Info.plist: add "remote-notification" to UIBackgroundModes; add NSCameraUsageDescription ("Clicks uses the camera to capture job and vehicle photos.") and NSPhotoLibraryUsageDescription ("Clicks uses your photo library to attach job and registration documents."). Keep existing entries.
2. GoogleService-Info.plist: do NOT fabricate one. Add a README note (or code comment in the notification service) stating the real file must be downloaded from the clicks-technician Firebase project and placed at ios/Runner/GoogleService-Info.plist, and verify the iOS Firebase init path won't crash when it is present.
3. In job_notification_service.dart, ensure iOS completeness: request permissions, handle the APNS token, and re-register the FCM token to the backend inside onTokenRefresh.
4. In technician_socket_service.dart, mirror the customer socket's resilience: enableReconnection with a generous attempt count and ~2s delay, websocket + polling transports, and on every (re)connect re-emit "register" and re-join/re-subscribe whatever the current active job needs so lifecycle events resume. Guard against duplicate listener registration on reconnect (the customer service's healthy-socket early-return pattern is the reference).
5. Do not change any event names or payloads.

ACCEPTANCE CRITERIA
- Info.plist diff shows the background mode + both usage strings.
- Socket drops now auto-reconnect and re-register without duplicating handlers.
- Your summary lists the exact manual Firebase console/Xcode steps left for me (APNs key upload, plist download, capability check).
```

---

## Prompt 13 — Partner app: Android 13+ notifications + background FCM (P1)

```
You are working in the Clicks roadside-assistance monorepo, Flutter app clicks-partner. Notifications are broken in two ways:

DEFECT A — android/app/src/main/AndroidManifest.xml declares ONLY the INTERNET permission. Without android.permission.POST_NOTIFICATIONS, Android 13+ silently suppresses every notification (there is no way to even ask the user).
DEFECT B — lib/core/notifications/partner_notification_service.dart only wires FirebaseMessaging.onMessage (foreground) and an EMPTY onMessageOpenedApp.listen((_) {}). There is no onBackgroundMessage handler, no getInitialMessage for killed-state taps, and no onTokenRefresh — so background/killed notifications go nowhere and a rotated FCM token is never re-registered with the backend.

TASK
1. Add <uses-permission android:name="android.permission.POST_NOTIFICATIONS"/> to the manifest and request the runtime permission on Android 13+ at an appropriate moment after login (use the app's existing permission approach or permission_handler if already a dependency; if adding a dependency, say so).
2. In partner_notification_service.dart:
   - Add a top-level @pragma('vm:entry-point') background handler registered via FirebaseMessaging.onBackgroundMessage.
   - Handle getInitialMessage() at startup so tapping a notification from a killed state routes to the relevant screen (match whatever routing the foreground handler implies; if none exists, land on the dashboard).
   - Implement onMessageOpenedApp with the same routing instead of the empty listener.
   - Subscribe to onTokenRefresh and POST the new token to the same backend endpoint the initial registration uses.
3. Follow the working reference implementation in clicks-user/lib/core/services/fcm_notification_service.dart where applicable.
4. Note in your summary that iOS Firebase config for this app is absent, and list what would be required if partner iOS push is ever needed.

ACCEPTANCE CRITERIA
- Android 13+ prompts for notification permission; granted notifications display in foreground, background, and killed states.
- Notification taps route correctly from background and killed states.
- Token rotation re-registers with the backend automatically.
```

---

## Prompt 14 — Fail-closed release builds for business and partner apps (P1)

```
You are working in the Clicks roadside-assistance monorepo, Flutter apps clicks-business and clicks-partner. A release build made without --dart-define flags currently ships a dead app pointing at an emulator address.

CONTEXT
In both apps, lib/core/config/app_config.dart reads ENV via String.fromEnvironment('ENV', defaultValue: 'staging'), and the staging base URL is http://10.0.2.2:5000 (Android-emulator localhost, cleartext HTTP). So `flutter build apk --release` with no defines produces a binary that can never reach a server.

TASK
For BOTH apps' app_config.dart:
1. Make the config fail-closed: in release mode (kReleaseMode), if ENV was not explicitly provided via --dart-define or resolves to a base URL that is localhost/10.0.2.2/non-HTTPS, throw a StateError at startup with a clear message ("Release build requires --dart-define=ENV=production") instead of silently using a dead or insecure URL.
2. In debug/profile mode, keep the current convenient staging/localhost defaults unchanged.
3. Require https:// for any non-local base URL in release mode.
4. Update each app's README (or create a short BUILD.md) with the exact production build command including the required dart-defines.

ACCEPTANCE CRITERIA
- flutter build apk --release with no defines produces an app that fails fast at launch with the explanatory error (never silently targets localhost).
- Debug builds behave exactly as before.
- The documented build command produces a working production configuration.
```

---

## Prompt 15 — Guard emit-after-await in the SOS cubit (P1, pattern-setter)

```
You are working in the Clicks roadside-assistance monorepo, Flutter app clicks-user. Fix a crash-class bug in the most critical flow, then we'll repeat the pattern elsewhere.

CONTEXT
lib/core/sos_services/sos_cubit.dart — the emergency SOS flow — contains ~18 emit() calls, many of which execute AFTER an await (network call, socket ack) with NO isClosed guard. If the user navigates away while a request is in flight (extremely likely under SOS stress), the cubit is closed and the late emit throws "Cannot emit new states after calling close", crashing during an emergency.

TASK
1. In sos_cubit.dart, insert `if (isClosed) return;` immediately before EVERY emit() that can execute after an await (including emits inside .then callbacks, socket event callbacks, timers, and catch blocks that follow an await). Emits that run synchronously before any await do not need the guard.
2. Where a guard would silently swallow a failure that something else depends on (e.g. an error state a listener needs), keep the side-effect (logging, cleanup) and skip only the emit.
3. Do not restructure the cubit, rename states, or alter logic — this is a surgical safety pass.
4. In your summary, list every other file in this repo with the same pattern so we can fix them next, by running a quick search across clicks-user, clicks-technician, and clicks-business for emit() calls following awaits in cubits with zero isClosed usage (known suspects: clicks-technician/lib/features/home/ui/cubit/home_cubit.dart raw emits around lines 104–360, clicks-business/lib/features/auth/login_cubit.dart).

ACCEPTANCE CRITERIA
- No emit in sos_cubit.dart can fire on a closed cubit.
- Behaviour is unchanged when the screen stays mounted.
- Your summary contains the follow-up file list with approximate line references.
```

---

## Prompt 16 — Durable outbox for cross-API notifications + accrual retry (P1)

```
You are working in the Clicks roadside-assistance monorepo. Cross-API dispatch notifications and partner accrual are fire-and-forget: a momentary outage silently loses them.

CONTEXT
- clicks-api/clicks-admin-api/src/controllers/businessPortalController.js (~line 246–280) POSTs to the tech-api internal notify endpoint (CUSTOMER_TECH_API_URL, x-internal-secret header) inside a try/catch that logs and continues — if tech-api is briefly down, the business job is created but the admin dispatch popup NEVER fires and nothing retries. A dispatcher can miss a job entirely.
- clicks-api/clicks-shared/services/partnerService.js accruePartnerFromCompletedJob is invoked from job completion inside a catch that logs and continues — a transient DB/logic failure silently under-pays a partner, with no reconciliation.

TASK
1. Create clicks-api/clicks-shared/models/OutboxEvent.js:
   - Fields: type (String, required — e.g. "admin_business_job_notify", "partner_accrual"), payload (Mixed, required), status (enum "pending" | "sent" | "failed", default "pending", index), attempts (Number, default 0), next_attempt_at (Date, index), last_error (String), created_at (Date, default now).
   - Export from clicks-shared/models/index.js.
2. In businessPortalController: keep the direct notify attempt first (happy path unchanged). Only when it throws or returns non-2xx, insert an OutboxEvent of type "admin_business_job_notify" with the exact request payload + target path, instead of just console.error.
3. In the job-completion partner-accrual catch (clicks-customer-tech-api jobController markCompleted), enqueue an OutboxEvent of type "partner_accrual" with { job_id } on failure. The accrual itself is already idempotent per job via PartnerEarning's unique index, so retrying is safe.
4. Create clicks-api/clicks-shared/services/outboxWorker.js: a startOutboxWorker(intervalMs = 30000) that each tick claims due pending events (next_attempt_at <= now, atomically flipped to a processing state via findOneAndUpdate to be multi-instance safe), dispatches by type ("admin_business_job_notify" → re-POST to tech-api with the internal secret; "partner_accrual" → re-run accruePartnerFromCompletedJob after loading the job), and on failure increments attempts with exponential backoff (30s, 2m, 10m, 1h) up to 8 attempts, then marks "failed" and logs an error (Sentry.captureException if Sentry is initialised).
5. Start the worker in BOTH APIs' bootstrap after the Mongo connection is up, each handling only the event types it can dispatch.
6. Keep every existing success path byte-identical.

ACCEPTANCE CRITERIA
- Killing tech-api during a business-portal job create produces a pending OutboxEvent that is delivered when tech-api returns; the admin popup fires late rather than never.
- A failed partner accrual is retried and, because of the unique index, never double-credits.
- Exhausted events end as "failed" with last_error populated, visible for manual review.
```

---

## Prompt 17 — Socket rooms so Redis scaling actually works (P1, big refactor — own session)

```
You are working in the Clicks roadside-assistance monorepo. Refactor the realtime layer from per-process socket maps to Socket.IO rooms so horizontal scaling with the Redis adapter actually works. Do this in its own session; touch only the files named below; keep every event name and payload byte-identical.

CONTEXT
File: clicks-api/clicks-customer-tech-api/src/services/sosSocketService.js (~1578 lines).
Current design: three JWT-authenticated namespaces (/customer, /technician, /admin). On "register", the handler stores socket.id in module-level Maps (technicianSockets, customerSockets keyed by user id, plus offline-timer maps). Targeted emits look up the map: e.g. customerNamespace.to(customerSockets.get(job.customer_id.toString())).emit("locationUpdate", ...). PROBLEM: these Maps are per-process. The Redis adapter (clicks-api/clicks-customer-tech-api/src/utils/socketAdapter.js) shares ROOM pub/sub across instances, but a Map lookup only finds sockets on the local instance — so with TECH_API_INSTANCES > 1, a customer connected to instance A never receives events emitted from instance B. The documented "set REDIS_URL then scale" path is broken without this refactor.

TASK
1. On connection/"register" in each namespace, socket.join(`user:${socket.user.id}`). Identity comes ONLY from the JWT (socket.user) — never from client-supplied ids (this is already the pattern; preserve it).
2. Replace every map-based targeted emit with a room emit: namespace.to(`user:${id}`).emit(event, payload) — for all customer, technician, and admin targeted sends. Broadcast emits to a whole namespace (adminNamespace.emit(...)) stay as they are.
3. Presence/offline tracking: the offline-timer logic currently keyed by the Maps must survive. Rework it using socket disconnect events + namespace.in(`user:${id}`).fetchSockets() (adapter-aware, works across instances) to check whether the user still has any live socket before marking them offline. Keep the existing grace-period timers.
4. Delete the technicianSockets/customerSockets Maps once nothing references them. If any handler used map presence as an "is online" check, replace with the fetchSockets-based check.
5. Preserve ALL access checks (assertSocketJobAccess etc.), throttles (location ~3s), and every event contract exactly.
6. Keep single-instance behaviour identical: with the memory adapter, rooms behave exactly like the maps did.

ACCEPTANCE CRITERIA
- grep shows no remaining .get(...) socket-id targeting; all targeted emits go through user rooms.
- Location updates, job lifecycle events, SOS claim/cancel, and admin popups all still flow end-to-end on a single instance.
- Your summary explains why this now works across N instances with REDIS_URL set, and lists the ops prerequisites (REDIS_URL + sticky sessions at the load balancer) before raising TECH_API_INSTANCES.
```

---

## Prompt 18 — Real CI test gate for the critical journeys (P2)

```
You are working in the Clicks roadside-assistance monorepo. CI currently runs zero real tests: the "api-smoke" job's start step is literally `node -e "console.log('deps ok')"` and the auth smoke is a syntax check. Build a genuine integration-test gate. Tests must NEVER touch production endpoints, real SMS, or real FCM.

CONTEXT
- APIs: clicks-api/clicks-admin-api and clicks-api/clicks-customer-tech-api, shared models in clicks-api/clicks-shared.
- CI: clicks-api/.github/workflows/ci.yml.
- SMS has a console provider fallback (SMS_PROVIDER unset → console); FCM should be stubbed.
- Useful behaviours to test are described in: otpVerify (clicks-shared/utils/otpVerify.js), RBAC (clicks-admin-api/src/middleware/rbac.js), proximity gate + completion (clicks-customer-tech-api/src/controllers/jobController.js), finance lock (clicks-admin-api/src/controllers/financePortalController.js).

TASK
1. Add Jest + supertest + mongodb-memory-server as devDependencies of clicks-api (root-level test workspace or per-API — choose the simplest layout and explain it). Boot each Express app against the in-memory Mongo; export the app instances from the index files without starting listeners if needed (do a minimal refactor to make the apps importable — e.g. split app construction from server.listen — without changing runtime behaviour).
2. Write integration tests covering, at minimum:
   a. OTP security: a request-OTP → verify flow where (i) a wrong code increments attempts and returns the generic error, (ii) the 6th wrong attempt returns 429 and deletes the record, (iii) a Mongo-operator payload ({"otp":{"$gt":""}}) is rejected, never matching.
   b. RBAC: a JWT with role "Job Dispatcher" gets 403 on a requireFullAdmin route (e.g. DELETE /api/jobs/:id) and 200 on a requireOps route (GET /api/jobs); a technician-role JWT gets 403 on both.
   c. Job lifecycle + proximity: seed a technician + assigned job with coordinates; starting from beyond JOB_START_MAX_METERS returns 400 with distanceMeters; within range succeeds; completion requires payment_status "paid" and a signature.
   d. Earnings idempotency: complete the same job twice (sequentially and with Promise.all concurrency); assert TechnicianEarnings totals reflect exactly ONE credit.
   e. Finance lock: audit a completed job, then assert a second audit and an updateFinance both return 409, and the reopen → audit path works.
3. Add npm scripts (test) and replace the no-op CI steps with an actual `npm test` job that runs on every PR and push to main/staging. Keep the Gitleaks job.
4. Stub outbound side effects (FCM service, SMSala, axios internal notify) with Jest mocks so no network calls leave the test process.

ACCEPTANCE CRITERIA
- `npm test` passes locally against in-memory Mongo with zero external network access.
- CI fails if any of the five behaviours above regress.
- No test file contains a production URL or real credential.
```

---

## Prompt 19 — Unify job-status labels across the web portals (P2)

```
You are working in the Clicks roadside-assistance monorepo. The same job status renders differently on every surface: the admin portal hardcodes labels ("assigned" → "Technician assigned", "en_route" → "Enroute", "in_progress" → "In progress") while the business portal derives them generically in a misplaced util ("assigned" → "Assigned", "en_route" → "En Route", "in_progress" → "In Progress"). Ops staff, business users, and finance see different words for the same state.

CONTEXT
- Admin hardcoded labels: clicks-interface/src/pages/JobManagement/Jobs.jsx (~lines 20–32) and likely echoed in JobDetails/EditJobModal.
- Business generic labels: clicks-business-web/src/utils/phone.js exports statusLabel and statusClass (yes, in the phone util).
- Finance portal renders statuses too: clicks-finance-web/src/pages.
- The three portals share no package, so the map must be one canonical file COPIED verbatim into each portal with a header comment naming the other two copies.

TASK
1. Define the canonical map in clicks-interface/src/utils/jobStatusLabels.js: every job_status value used in the codebase (search the backend Job model and controllers for the full set: assigned, accepted, en_route, arrived, in_progress, completed, cancelled, pending — include any others you find) → { label, cssClass }. Choose the clearest label per status and list your choices in the summary (e.g. en_route → "En route").
2. Copy the identical file to clicks-business-web/src/utils/jobStatusLabels.js and clicks-finance-web/src/utils/jobStatusLabels.js, each with the header comment "KEEP IN SYNC — canonical copy also in clicks-interface/clicks-business-web/clicks-finance-web".
3. Replace every ad-hoc status label/class in the three portals with lookups into this map, including the statusLabel/statusClass in business's phone.js (move them out of phone.js; leave a re-export or update importers). Unknown statuses fall back to a title-cased raw value so nothing renders blank.
4. Do not change any Flutter apps in this task.

ACCEPTANCE CRITERIA
- assigned / en_route / in_progress / completed / cancelled render with identical wording in admin, business, and finance portals.
- No hardcoded status strings remain in JSX (grep for "Enroute" and "Technician assigned" returns nothing).
- Status CSS classes still apply so existing styling keeps working.
```

---

## Prompt 20 — Admin audit log: who did what to which job (P2)

```
You are working in the Clicks roadside-assistance monorepo. There is no attributable record of admin actions on jobs — "who cancelled job X, when, from where" is currently unanswerable. Add an admin audit log.

CONTEXT
- Admin job mutations live in clicks-api/clicks-admin-api/src/controllers/jobController.js (createJob, updateJob, deleteJob, and any dispatch/assign/cancel paths) with routes in src/routes/jobs.js guarded by authenticateToken + requireOps/requireFullAdmin. req.user carries { id, role, ... } from the JWT; app.set("trust proxy", 1) is configured so req.ip is real.
- Lead and SOS mutations (src/controllers/leadController.js claim/convert/lost, src/controllers/sosController.js claimSOS) deserve the same treatment.

TASK
1. Create clicks-api/clicks-shared/models/AdminAuditLog.js:
   - Fields: admin_id (ObjectId, required, index), admin_role (String), action (String, required — e.g. "job.update", "job.cancel", "job.delete", "job.create", "lead.convert", "sos.claim"), entity_type (String, required), entity_id (ObjectId, required, index), changes (Mixed — for updates, an object of { field: { from, to } } for changed fields only; cap serialized size ~8KB), ip (String), at (Date, default now, index). Append-only.
   - Export from clicks-shared/models/index.js.
2. Add a small helper clicks-api/clicks-admin-api/src/utils/auditLog.js: recordAudit({ req, action, entityType, entityId, changes }) that never throws (catch + console.error) so logging can't break the main operation.
3. Call it from every job create/update/delete/cancel/dispatch path in jobController.js (compute the changes diff from the pre-update document for updates), from lead convert/lost in leadController.js, and from claimSOS in sosController.js.
4. Add GET /api/admins/audit-log (authenticateToken + requireFullAdmin) with pagination (page/limit), filterable by entity_id, admin_id, and action; newest first.
5. No UI work in this task.

ACCEPTANCE CRITERIA
- Editing a job produces one row with the acting admin, role, IP, timestamp, and a from/to diff of changed fields only.
- Cancelling, deleting, dispatching, converting a lead, and claiming an SOS each produce attributable rows.
- Audit failures never fail the underlying request.
- The list endpoint is full-admin-only and paginated.
```

---

## Manual ops checklist (Cursor cannot do these)

1. Rotate ALL secrets: Atlas password(s), JWT_SECRET, JWT_REFRESH_SECRET, INTERNAL_API_SECRET, SMSala token, every Google Maps key, both Firebase service-account keys. Give each environment distinct values (admin+tech secrets matched to each other, unique per env). Update Railway/Vercel env stores, then delete SECRETS.TRANSFer.md from every machine.
2. Restrict Maps keys: HTTP-referrer for web keys, package name + SHA-1 / bundle id for mobile keys.
3. `git rm --cached` the committed credential files identified by Prompt 5, then commit; scrub git history if any were ever pushed.
4. Commit the entire working tree (including the untracked clicks-finance-web) before running the tag-deploy workflow from Prompt 6; create the RAILWAY_TOKEN GitHub secret.
5. Create the Sentry projects and set SENTRY_DSN on both Railway services (Prompt 4); add Crashlytics/Sentry to the Flutter apps as a follow-up.
6. Firebase console: upload the APNs auth key for clicks-technician, download GoogleService-Info.plist into ios/Runner (Prompt 12).
7. After Prompt 3, switch Railway health checks to /api/health (readiness).
8. Before scaling tech-api beyond one instance (after Prompt 17): set REDIS_URL and enable sticky sessions.
