# Cursor Composer 2.5 — Round 2 Prompts (from the V2 Re-Audit)

Round 1 fixes are verified and in place. These prompts cover what the V2 re-audit found still open:
the new findings (N-1…N-4), the deliberately-deferred rollouts, and the remaining P1/P2 items.
Each block is one complete, self-contained prompt — copy the whole block into Composer, review the
diff, commit, move on. Run them in order.

REMINDER — these are NOT code and Cursor cannot do them (do them first / in parallel):
commit + tag the whole tree, rotate all secrets and delete SECRETS.TRANSFER.md, set SENTRY_DSN on
both Railway services, repoint Railway health checks to /api/health, add the technician
GoogleService-Info.plist + APNs key, restrict every Google Maps key.

---

## Prompt 1 — N-1: Never strand a technician's earnings (outbox fallback for the credit)

```
You are working in the Clicks roadside-assistance monorepo. Close a money-path gap introduced by the
recent atomicity fix in job completion.

CONTEXT
File: clicks-api/clicks-customer-tech-api/src/controllers/jobController.js, function markCompleted.
The completion flow is now: validations → atomic Job.findOneAndUpdate({_id, job_status:"in_progress"},
{$set:{job_status:"completed", ...}}) → then, only on match: (a) await notifyCustomerJobEvent,
(b) partner accrual (with an outbox fallback on failure), (c) the technician credit — a
TechnicianEarningEntry ledger insert (unique index on job_id, duplicate-key 11000 = already credited)
followed by TechnicianEarnings $inc aggregates and a weekly-bucket update, (d) receipt safety-create.

THE GAP: the job flips to "completed" BEFORE the credit runs. If the ledger insert or the aggregate
$inc throws for any reason OTHER than duplicate-key (transient Atlas blip, timeout), the client gets
a 500 — but a retry now hits the CAS guard, gets the idempotent "already completed" 200, and the
technician is NEVER credited. Partner accrual already has an outbox fallback
(enqueueOutboxEvent(OUTBOX_TYPES.PARTNER_ACCRUAL, ...) in clicks-api/clicks-shared/services/
outboxWorker.js); the technician credit does not. Also, the awaited customer notify runs BEFORE the
credit — a throw there would strand earnings the same way.

TASK
1. In clicks-api/clicks-shared/services/outboxWorker.js:
   - Add OUTBOX_TYPES.TECHNICIAN_CREDIT = "technician_credit".
   - Add a dispatchTechnicianCredit(payload) handler: given { job_id }, load the job, and if it is
     completed with an assignedTechnician, run the SAME credit logic used in markCompleted (ledger
     insert with 11000-tolerant catch, then aggregates + weekly bucket + Technician.performance sync
     only when the ledger insert succeeded). Extract that credit logic into a shared function —
     create clicks-api/clicks-shared/services/technicianCredit.js exporting
     creditTechnicianForJob(job) — and have BOTH markCompleted and the outbox handler call it, so
     the logic exists once. It is idempotent by construction via the ledger's unique index, so
     outbox retries are safe.
   - Register the new type in dispatchEvent's switch.
2. In markCompleted:
   - Replace the inline credit block with a call to creditTechnicianForJob(updated), wrapped in
     try/catch. On ANY failure, enqueue OUTBOX_TYPES.TECHNICIAN_CREDIT with { job_id } (nested
     try/catch around the enqueue, mirroring the partner-accrual pattern) and continue — do not 500
     the request for a credit failure once the job is legitimately completed.
   - Reorder so MONEY COMES FIRST: run creditTechnicianForJob and the partner accrual BEFORE the
     best-effort customer notify, and wrap the notify in its own try/catch (log + Sentry
     captureException, never fail the request for a notify error).
3. In clicks-api/clicks-customer-tech-api/src/index.js, add OUTBOX_TYPES.TECHNICIAN_CREDIT to the
   types array of the tech-api's startOutboxWorker call.
4. Add an integration test in clicks-api/tests/integration/ (follow the existing
   earnings-idempotency test's helpers): simulate a credit failure on first completion (jest.spyOn
   the ledger create to reject once), assert the response is still 200, an OutboxEvent of type
   technician_credit is pending, then invoke the dispatch handler directly and assert the credit
   lands exactly once.

ACCEPTANCE CRITERIA
- The credit logic exists in exactly one shared function used by both paths.
- A transient credit failure after completion leaves a pending outbox event that, when processed,
  credits exactly once (ledger row count 1, totals credited once).
- A notify failure can no longer prevent the credit.
- Existing tests still pass; response shapes unchanged.
```

---

## Prompt 2 — N-2: Make the CI test suite actually runnable (pin + cache the mongod binary)

```
You are working in the Clicks roadside-assistance monorepo. The new integration suite
(clicks-api/tests/, jest + supertest + mongodb-memory-server) is wired into CI but its MongoDB
binary download is fragile: mongodb-memory-server auto-resolves a version/distro combo (e.g.
mongodb-linux-x86_64-ubuntu2204-7.0.24) that can 403 when the combo doesn't exist or the runner
distro moves (ubuntu-latest → 24.04). The suite has never run green. Also, the CI steps use
`npm ci || npm install`, which silently tolerates lockfile drift.

CONTEXT
- Test workspace: clicks-api/package.json (scripts test / test:ci), clicks-api/jest.config.js,
  clicks-api/tests/helpers/db.js (calls MongoMemoryServer.create() with no options).
- CI: clicks-api/.github/workflows/ci.yml, job "integration-tests" on ubuntu-latest.

TASK
1. In clicks-api/tests/helpers/db.js, make the binary version explicit and overridable:
   MongoMemoryServer.create({ binary: { version: process.env.MONGOMS_VERSION || "7.0.14" } }).
   Pick as the default a version that is actually published for ubuntu2204 x86_64 (verify against
   the mongodb-memory-server known-versions list; if 7.0.14 is wrong, choose the nearest published
   7.0.x and say which you chose and why).
2. In ci.yml integration-tests job:
   - Set env MONGOMS_VERSION at the job level (same value as the default).
   - Add an actions/cache step for ~/.cache/mongodb-binaries keyed on the MONGOMS_VERSION and
     runner OS, BEFORE the test step, so the binary downloads once per version.
   - Pin the job to runs-on: ubuntu-22.04 instead of ubuntu-latest, so a distro bump can't silently
     change which binary is resolved. Leave a comment explaining why.
   - Replace every `npm ci || npm install` in the workflow with plain `npm ci` so lockfile drift
     fails the build loudly instead of being papered over.
3. Do not change any test logic.

ACCEPTANCE CRITERIA
- db.js honors MONGOMS_VERSION with a sane pinned default.
- The workflow caches the binary, pins the runner distro, and uses strict npm ci everywhere.
- Your summary states the exact pinned version and the cache key.
```

---

## Prompt 3 — Roll out secure token storage to the remaining three Flutter apps

```
You are working in the Clicks roadside-assistance monorepo. The technician app has already been
migrated to flutter_secure_storage — use it as the reference implementation and replicate the
pattern in the other three apps. Do all three in this task, one app at a time, and keep each app's
diff separable.

CONTEXT — the reference (already done, do not modify):
clicks-technician/lib/core/helper/cache_helper.dart — flutter_secure_storage ^11.0.0;
secureWrite/secureRead/secureDelete; a _secureKeys list covering the auth/refresh token keys;
_migrateLegacyTokens() one-time migration that copies tokens out of plaintext SharedPreferences and
removes them; _loadSecureTokensIntoCache() for sync reads after init; a guard that throws if a
secure key is written through the plain SharedPreferences API; deletion on logout.

TARGETS (all still storing the JWT in plaintext SharedPreferences via their own CacheHelper):
- clicks-user/lib/core/helper/cache_helper.dart (token written by lib/features/login/ui/cubit/
  login_cubit.dart; read for Dio headers and the customer socket auth in
  lib/core/sos_services/customer_socket_service.dart)
- clicks-business/lib/core/helper/cache_helper.dart (written by lib/features/auth/login_cubit.dart)
- clicks-partner/lib/core/helper/cache_helper.dart (written by lib/features/auth/login_screen.dart)

TASK — for EACH of the three apps:
1. Add flutter_secure_storage ^11.0.0 to pubspec.yaml.
2. Port the technician CacheHelper pattern: secure read/write/delete, the migration, cached sync
   token reads, the plain-API guard for secure keys, the same Android/iOS options the technician
   app uses.
3. Find EVERY read/write of the token key in lib/ (grep for the key string the app uses) and route
   it through the secure API: login save, logout delete, Dio/DioHelper Authorization header, socket
   setAuth (clicks-user), splash/auto-login checks.
4. Preserve each app's existing key names so the migration picks up current sessions — existing
   logged-in users must NOT be logged out by this change.
5. Do not touch the technician app.

ACCEPTANCE CRITERIA
- Zero remaining plaintext SharedPreferences reads/writes of auth tokens in the three apps (except
  inside the one-time migration).
- Login, authenticated API calls, socket connect (clicks-user), app restart auto-login, and logout
  all still work in each app.
- Summary lists, per app, every call site you rerouted.
```

---

## Prompt 4 — Finish the emit-after-await sweep (technician home_cubit + business login_cubit)

```
You are working in the Clicks roadside-assistance monorepo. The sos_cubit in clicks-user has already
been guarded (15 isClosed guards) — finish the sweep in the two known remaining hotspots. This is a
surgical safety pass: no restructuring, no renamed states, no logic changes.

CONTEXT
Pattern being fixed: a Cubit emit() that executes after an await (or inside a .then / socket
callback / timer / catch block that follows an await) throws "Cannot emit new states after calling
close" if the screen was dismissed mid-request — a crash. The guard is `if (isClosed) return;`
immediately before the emit (keep side-effects like logging/cleanup; skip only the emit).

TARGETS
1. clicks-technician/lib/features/home/ui/cubit/home_cubit.dart — a large cubit (~1400 lines) with
   many raw emits after awaits (known unguarded areas around the action handlers near lines
   ~104, ~123, ~163, ~303, ~356, ~360, plus socket/timer callbacks). It currently has only ONE
   isClosed usage (inside _emitLoaded). Guard every emit that can run after an await, including
   those inside callbacks registered on the socket service and inside catch blocks.
2. clicks-business/lib/features/auth/login_cubit.dart — zero guards today; it emits after 5+ awaits.

TASK
- Apply the guard exhaustively in both files.
- Where an emit lives inside a long-lived callback (socket listener, periodic timer), also confirm
  the cubit cancels/ignores those callbacks on close if a close() override already exists; do NOT
  add new lifecycle machinery — just the guards.
- Then run a repo-wide sanity check and report (summary only, no changes): any OTHER cubit in
  clicks-user, clicks-technician, clicks-business with >5 emits, at least one await before an emit,
  and zero isClosed usage — list file paths so we know what's left.

ACCEPTANCE CRITERIA
- No emit in either target file can fire on a closed cubit.
- Behaviour is unchanged while the screen stays mounted.
- Summary contains the residual-risk file list.
```

---

## Prompt 5 — Crash reporting in the two field-critical Flutter apps

```
You are working in the Clicks roadside-assistance monorepo. There is no crash reporting in any
Flutter app — field crashes (a technician mid-job, a customer mid-SOS) are invisible. Add
Sentry crash reporting to clicks-technician and clicks-user. Use Sentry (sentry_flutter), NOT
Firebase Crashlytics — the backend already uses Sentry, so one pane of glass.

CONTEXT
- Both apps read config via String.fromEnvironment in lib/core/config/app_config.dart.
- Backend precedent: DSN-gated init that is a complete no-op when unset
  (clicks-api/clicks-shared/middleware/sentry.js) — mirror that philosophy.
- Entry points: each app's lib/main.dart. The technician app also has a background location/service
  layer whose errors matter most.

TASK — for BOTH apps:
1. Add sentry_flutter to pubspec.yaml.
2. Read the DSN from --dart-define SENTRY_DSN via app_config (empty default). When empty, the app
   must run exactly as today — no Sentry init at all.
3. When set, wrap the app bootstrap in SentryFlutter.init: environment from the existing ENV value,
   release from the pubspec version if accessible, sensible tracesSampleRate of 0 (crashes only, no
   performance tracing for now).
4. Route FlutterError.onError and PlatformDispatcher.instance.onError through Sentry (SentryFlutter
   does most of this — verify async errors outside runApp are captured).
5. Add captureException calls in the highest-value catch blocks that currently only log:
   clicks-technician lib/core/sos_services/technician_socket_service.dart and the location heartbeat
   sends in home_cubit; clicks-user lib/core/sos_services/sos_cubit.dart and
   customer_socket_service.dart. Keep the existing logging.
6. NEVER attach the auth token, phone numbers, or precise coordinates to Sentry events — scrub via
   beforeSend if any breadcrumb would include them.
7. Update each app's BUILD.md/README with the extra --dart-define=SENTRY_DSN=... for production
   builds (placeholder only, no real DSN).

ACCEPTANCE CRITERIA
- With no SENTRY_DSN define, both apps behave byte-identically to today.
- With a DSN, an uncaught exception and a caught socket error both produce Sentry events without
  PII (token/phone/coords).
- Summary lists every catch block you instrumented.
```

---

## Prompt 6 — Integration tests for SOS end-to-end and socket reconnect

```
You are working in the Clicks roadside-assistance monorepo. The integration suite
(clicks-api/tests/) covers OTP, RBAC, job lifecycle + proximity, earnings idempotency, and the
finance lock — but NOT the two most safety-critical realtime journeys: customer SOS end-to-end and
socket-drop recovery. Add both as integration tests against the real tech-api with real Socket.IO
clients.

CONTEXT
- App factory: clicks-api/clicks-customer-tech-api/src/createApp.js — check whether it exposes the
  http server + io instance for tests; if it only returns the Express app, extend it minimally to
  also build and return { app, server, io } with initializeSOSSocket attached (do not change
  runtime behaviour in src/index.js).
- Socket layer: clicks-api/clicks-customer-tech-api/src/services/sosSocketService.js — namespaces
  /customer, /technician, /admin authenticated by JWT in handshake.auth.token; rooms are
  user:<id>; events include createSOS → sosCreated + newSOSRequest (admin), updateLocation →
  locationUpdate (customer), register on connect.
- Test helpers: clicks-api/tests/helpers/ (db, tokens, seed) and setupMocks.js (FCM/SMS/axios are
  mocked). Add socket.io-client as a devDependency of the test workspace.
- SOS flow specifics live in the customer namespace createSOS handler (kill-switch flag
  LAUNCH_PUBLIC_SOS may gate it — set it true in tests/setupEnv.js if needed).

TASK
1. New suite tests/integration/sos-e2e.integration.test.js:
   - Boot the tech app on an ephemeral port (server.listen(0)).
   - Seed a customer and a technician (with currentLocation near the SOS point).
   - Connect a customer socket (/customer, JWT auth) and an admin socket (/admin, admin-role JWT).
   - Customer emits createSOS with valid coords; assert the customer receives sosCreated AND the
     admin receives newSOSRequest with matching sos id; assert the SOSRequest document exists with
     status pending.
   - Exercise the claim path (admin sosAccepted event or the REST claim endpoint — whichever the
     code implements for assignment) and assert the SOS document transitions and the customer gets
     the corresponding event.
   - Negative: a socket connection with an invalid/absent JWT must be rejected (connect_error).
2. New suite tests/integration/socket-reconnect.integration.test.js:
   - Connect a technician socket, emit register, then emit updateLocation and assert the Technician
     document's currentLocation/lastLocationAt update and an admin socket receives
     technicianLocationUpdate.
   - Force-disconnect the technician socket, reconnect with the same JWT, re-emit register, emit
     updateLocation again, and assert delivery still works (room re-join effective).
   - Assert a customer in a job room receives locationUpdate only when the job's
     assertSocketJobAccess passes (wrong technician's location for someone else's job must NOT
     arrive).
3. Use fake-timer-free real async with generous per-event timeouts (helper: waitForEvent(socket,
   event, ms) that rejects on timeout). Clean up all sockets and the server in afterAll —
   no open-handle leaks.

ACCEPTANCE CRITERIA
- Both suites pass locally under the pinned mongod version and are picked up by the existing
  jest testMatch.
- No test touches FCM/SMS/production; all realtime assertions go through real socket.io-client
  connections.
- Summary documents any minimal createApp changes made to expose the server/io for tests.
```

---

## Prompt 7 — N-3: Outbox worker lifecycle + atomic attempts

```
You are working in the Clicks roadside-assistance monorepo. Two hygiene fixes in
clicks-api/clicks-shared/services/outboxWorker.js and its call sites.

CONTEXT
- startOutboxWorker(intervalMs, { types }) runs an immediate tick then setInterval, and RETURNS the
  interval handle — but neither API stores or clears it, so shutdown is abrupt and a mid-dispatch
  tick can be killed after claiming an event (recovered only by the 5-minute stale-reclaim).
- markFailedOrRetry computes attempts from the in-memory event object ((event.attempts || 0) + 1)
  rather than an atomic $inc. Safe today because of the claim lock, but strictly racy.

TASK
1. In outboxWorker.js:
   - Add stopOutboxWorker(handle) that clearInterval(handle)s and returns a promise resolving when
     any in-flight tick finishes (track the in-flight tick promise; ticking flag already exists).
   - Call handle.unref?.() on the interval so the worker never keeps a dying process alive.
   - Switch attempts accounting to atomic: use findOneAndUpdate with $inc: { attempts: 1 } to bump
     and read the new count, then decide failed-vs-retry from the RETURNED document's attempts.
2. Wire graceful shutdown in both APIs (clicks-api/clicks-admin-api/src/index.js and
   clicks-api/clicks-customer-tech-api/src/index.js): store the worker handle; on SIGTERM/SIGINT,
   stop the worker (await), close the HTTP server, disconnect mongoose, then exit 0 — with a 10s
   hard-exit fallback timer (unref'd). Keep the existing bootstrap order otherwise.
3. Do not change claim/backoff semantics or event payloads.

ACCEPTANCE CRITERIA
- SIGTERM during an active tick lets the in-flight event finish (sent or scheduled for retry) before
  exit; no event is left claimed by a cleanly-stopped worker.
- Concurrent failure handling can never lose an attempt increment.
- Existing outbox tests (if any) and integration suites still pass.
```

---

## Prompt 8 — N-4: CI guard that the three status-label copies never drift

```
You are working in the Clicks roadside-assistance monorepo. jobStatusLabels.js exists as three
byte-identical copies (clicks-interface/src/utils/, clicks-business-web/src/utils/,
clicks-finance-web/src/utils/) because the portals share no package. The header comment says
"KEEP IN SYNC" but nothing enforces it.

TASK
1. Add a root-level script scripts/check-status-labels.mjs (plain Node, no dependencies) that reads
   the three files, compares their contents byte-for-byte (normalize line endings first so
   CRLF/LF differences don't false-positive), and exits 1 with a clear message naming the divergent
   file(s) if they differ.
2. Add a job (or a step in an existing lightweight job) to the repo-root workflow
   .github/workflows/deploy-production.yml AND to clicks-api/.github/workflows/ci.yml that runs
   `node scripts/check-status-labels.mjs`. It needs no npm install.
3. Mention the guard in the header comment of each of the three files.

ACCEPTANCE CRITERIA
- Editing one copy without the others fails CI with a message that names the file.
- Identical copies (regardless of CRLF/LF) pass.
```

---

## Prompt 9 — Unify job-status labels in the Flutter apps

```
You are working in the Clicks roadside-assistance monorepo. The three web portals now share a
canonical status→label map (see clicks-interface/src/utils/jobStatusLabels.js — the canonical
vocabulary is: pending "Pending", assigned "Assigned", accepted "Accepted", en_route "En route",
arrived "Arrived", in_progress "In progress", completed "Completed", cancelled "Cancelled", plus
legacy paid/confirmed/on_hold). The Flutter apps still hardcode their own strings, so a technician
and a dispatcher can see different words for the same job state.

TASK
1. In EACH of clicks-technician, clicks-user, and clicks-business, create
   lib/core/constants/job_status_labels.dart: a JobStatusLabels class with a static
   Map<String, String> mirroring the web map EXACTLY (same keys, same display strings), a
   labelFor(String? status) helper that falls back to title-casing the raw value, and the same
   "KEEP IN SYNC" header comment naming the web copies.
2. Sweep each app's lib/ for hardcoded job-status display strings and status-switch statements that
   produce labels (search for the raw enum values 'en_route', 'in_progress', 'assigned', 'arrived'
   and for display strings like 'En Route', 'Enroute', 'In Progress', 'Technician assigned') and
   replace label PRODUCTION with JobStatusLabels.labelFor. Do NOT touch logic that branches on the
   raw status value for behaviour — only what the user sees.
3. clicks-user is localized (assets/translations/en.json + ar.json, ~414 lines each): instead of
   hardcoding English there, add job_status.* keys to BOTH translation files (write real Arabic for
   the eight canonical states, matching the app's existing Arabic register) and have its
   labels file resolve through the translation keys. The other two apps are English-only today —
   plain strings are fine there.
4. List in your summary every call site changed per app, and any status value you found in Flutter
   that the canonical map does not cover.

ACCEPTANCE CRITERIA
- The same job status renders with the same wording on admin web, business web, finance web, and in
  each Flutter app (Arabic translation excepted, where the ar.json strings govern).
- No behavioural status checks were altered — label production only.
```

---

## Prompt 10 — Unify the mongoose version across clicks-shared and both APIs

```
You are working in the Clicks roadside-assistance monorepo. Fix a known dependency trap:
clicks-api/clicks-shared/package.json pins mongoose ^7 while clicks-admin-api and
clicks-customer-tech-api declare ^8. This has already caused a real bug (a bare
require("mongoose") inside admin-api resolving to a DIFFERENT module instance with its own
connection pool and model registry — see the warning comment in
clicks-api/clicks-shared/utils/coerce.js and the admin index.js workaround
require("clicks-shared/node_modules/mongoose")).

TASK
1. Align all three packages on the same mongoose major: upgrade clicks-shared to the ^8 range the
   APIs already use (pick the exact range the APIs declare). Regenerate the three package-locks.
2. Review clicks-shared for mongoose 7→8 breaking changes that actually apply to this codebase
   (check the models and utils: callback-style APIs, strictQuery defaults, ObjectId casting,
   removed options like useNewUrlParser/useUnifiedTopology — the tech-api index.js still passes
   those two, drop them since v8 ignores/warns). Fix what applies; list what you checked.
3. Remove the workaround require paths: replace require("clicks-shared/node_modules/mongoose") in
   clicks-api/clicks-admin-api/src/index.js (and anywhere else it appears — grep the repo) with a
   plain require("mongoose"), which is now safe because all packages share one major and npm will
   dedupe. Verify jobHeatmapController's mongoose usage is consistent too.
4. Run the integration test suite mentally against these changes: flag in your summary any test or
   model behaviour that could shift (e.g. strictQuery), and set explicit options where v8 defaults
   differ from v7 behaviour the code relies on.

ACCEPTANCE CRITERIA
- All three package.jsons declare the same mongoose range; no clicks-shared/node_modules/mongoose
  require remains anywhere.
- Both APIs boot (node --check passes on entry files; app factories construct without throwing).
- Summary lists every 7→8 breaking change reviewed and its disposition.
```

---

## Prompt 11 — Structured logs only (retire morgan("dev")) + request-id everywhere

```
You are working in the Clicks roadside-assistance monorepo. The admin API logs twice: the shared
JSON observability middleware (clicks-api/clicks-shared/middleware/observability.js — request-id +
structured http_request lines) AND morgan("dev") (human-format, no request id), which pollutes
Railway's log stream and breaks line-based parsing.

TASK
1. In clicks-api/clicks-admin-api/src/createApp.js and clicks-api/clicks-customer-tech-api/src/
   createApp.js: remove morgan in production paths — keep it only when NODE_ENV === "development"
   (gate it, don't delete the dependency). The JSON middleware is the production log.
2. In observability.js, confirm the request id is exposed on the response (X-Request-Id header) so
   clients and Sentry events can be correlated; add the header if missing.
3. Sweep both APIs' controllers for high-volume console.log lines that fire per-request in hot
   paths (the socket service's per-location-update logs in sosSocketService.js are the known
   offender — it already varies by NODE_ENV; make non-development builds log location updates only
   on error, not per update). List every hot-path log you silenced.
4. Do not change the JSON log schema.

ACCEPTANCE CRITERIA
- Production log output is one JSON line per request plus errors — no morgan lines, no per-location
  chatter.
- Every HTTP response carries X-Request-Id.
- Development behaviour (morgan + verbose logs) is preserved.
```

---

## Prompt 12 — Landing site hygiene: scratch files out, security headers on

```
You are working in the Clicks roadside-assistance monorepo, in clicks-landing (Astro marketing site
deployed on Vercel at clicks.qa).

DEFECTS
1. Committed scratch/dead files at the project root: generated_code_temp.txt (~85KB of dumped
   generated code), test-run.mjs, update_navs.mjs, download-assets.mjs — clutter and a mild
   information leak.
2. vercel.json sets no security or caching headers, unlike the three portals (which set no-store on
   HTML + immutable on assets).

TASK
1. Delete the four scratch files (verify nothing imports them first — grep the project).
2. Extend vercel.json with headers:
   - All routes: X-Content-Type-Options: nosniff, Referrer-Policy: strict-origin-when-cross-origin,
     X-Frame-Options: DENY, Permissions-Policy disabling camera/microphone/geolocation.
   - A Content-Security-Policy appropriate for a static Astro site with no external scripts —
     inspect the built page's actual needs (inline styles? Google Fonts? the Play Store link is
     just an anchor) and write the tightest policy that doesn't break rendering; prefer
     default-src 'self' with explicit narrow allowances, and say what you allowed and why.
   - Cache-Control: immutable, max-age=31536000 for hashed /_astro/* assets; no-store for HTML.
3. Match the header syntax used by the portals' vercel.json files for consistency.

ACCEPTANCE CRITERIA
- Scratch files gone; site builds (astro build succeeds).
- vercel.json serves the headers above; CSP documented in your summary with each allowance
  justified.
```

---

## Prompt 13 — MongoDB transactions on the completion cluster (do last; own session)

```
You are working in the Clicks roadside-assistance monorepo. Final hardening of the money path:
wrap the multi-document writes at job completion in a MongoDB transaction. Do this AFTER the
technician-credit outbox work (shared services/technicianCredit.js) is merged — build on it, don't
duplicate it. Atlas runs a replica set, so transactions are available; guard for standalone Mongo.

CONTEXT
- Completion: clicks-api/clicks-customer-tech-api/src/controllers/jobController.js markCompleted —
  atomic CAS on the Job, then creditTechnicianForJob (TechnicianEarningEntry insert with unique
  job_id + TechnicianEarnings $inc + weekly bucket + Technician.performance), partner accrual
  (clicks-api/clicks-shared/services/partnerService.js — PartnerEarning create with unique job +
  Partner counters), receipt safety-create.
- The system already tolerates partial failure via outbox retries + unique-index idempotency. The
  transaction's job is to make the COMMON path all-or-nothing so retries become rare, not to
  replace the outbox.

TASK
1. In markCompleted, open a session (mongoose.startSession) and run withTransaction covering: the
   Job CAS update, creditTechnicianForJob, and the receipt creation. Thread the session through —
   creditTechnicianForJob and the receipt create must accept an optional { session } and pass it to
   every query/create/update inside (update technicianCredit.js accordingly; default null keeps
   the outbox retry path session-free and working on its own).
2. Keep partner accrual OUTSIDE the transaction (it spans Source/Partner logic and is already
   idempotent + outbox-retried); it runs after commit.
3. On transaction abort: nothing was written — return 500 with the existing error shape and DO NOT
   enqueue outbox events (the client can simply retry the whole completion; the CAS will still be
   in_progress). On post-commit failures (partner accrual, notify) keep the current outbox/catch
   behaviour.
4. Environment guard: detect "Transaction numbers are only allowed on a replica set" class errors
   (MongoServerError codes 20 / IllegalOperation) and fall back to the current non-transactional
   flow with a one-time warning log, so local standalone Mongo and mongodb-memory-server (which
   runs standalone by default) still work. Alternatively configure the test helper to start
   mongodb-memory-server as a replSet (MongoMemoryReplSet) — choose one, justify it, and keep the
   integration suite green either way.
5. Extend the earnings-idempotency integration test: a forced failure INSIDE the transaction (spy
   on Receipt.create to reject once) must leave the job still in_progress and zero ledger rows —
   then a retry completes and credits exactly once.

ACCEPTANCE CRITERIA
- Happy path: Job flip + credit + receipt commit or roll back together.
- Standalone-Mongo environments still work via the guard or replset test config.
- The new failure-injection test passes; all existing suites pass.
```

---

## Suggested order & session grouping

| Session | Prompts | Why grouped |
|---|---|---|
| 1 | 1, 7 | Both touch outboxWorker — do sequentially in one session |
| 2 | 2, 8 | CI-only changes, quick |
| 3 | 3 | Flutter secure storage ×3 (biggest Flutter diff) |
| 4 | 4, 5 | Flutter safety + crash reporting |
| 5 | 6 | Realtime tests (needs createApp awareness) |
| 6 | 9 | Flutter labels (+ Arabic strings review) |
| 7 | 10, 11 | Backend deps + logging |
| 8 | 12 | Landing, standalone |
| 9 | 13 | Transactions — LAST, after 1 is merged |

And the standing reminder: none of this matters until the tree is committed and tagged, secrets are
rotated, SENTRY_DSN is set, and CI has run green once. Those are yours, not Composer's.
