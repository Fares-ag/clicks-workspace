# Clicks Platform — Production-Readiness Re-Audit (V3)

**Prepared for:** Clicks (Be Electric, Qatar) leadership / engineering
**Date:** 20 August 2026
**Baseline:** V2 re-audit (earlier today). This V3 verifies the Round 2 remediation pass against a fresh snapshot staged from the connected machine and diffed file-by-file against the V2 snapshot (~115 files changed/added).
**Method:** Static inspection of every changed file; each Round 2 fix read and verified individually. Test execution was re-attempted in the audit sandbox and remains blocked by the sandbox's egress policy (the mongod binary host is unreachable from here — an environmental limit, not a code defect; the suite must prove itself in GitHub Actions, which the updated CI now supports properly). Deployed endpoints not live-probed. **UNVERIFIED** marks what code cannot show. No code was modified.

> **Verdict in one line:** **All 13 Round 2 prompts are implemented, and implemented well — the engineering backlog from V1/V2 is now essentially cleared (score ≈6.3 → ≈6.8).** What separates Clicks from a defensible public soft launch is no longer a single line of code: it is the unchanged ops gate — **git HEAD still hasn't moved (now 248 uncommitted files), `SECRETS.TRANSFER.md` still sits in the tree, no DSN is set, and CI has never run green.** The codebase has earned its launch; the operations around it haven't yet.

---

## 1. Executive Summary

**Is Clicks production-ready for a Qatar public launch? The code now substantially is. The operation around it is not — and that gap is now the entire risk.**

This is the third pass over this platform in two days, and the trajectory is unambiguous: V1 found real vulnerabilities and integrity bugs; the Round 1 fixes closed them correctly; V2 found the second-order gaps those fixes exposed; and Round 2 has now closed those too — including the subtle ones. The money path is not just race-free but **transactional with a graceful standalone fallback and an outbox safety net**; the test suite now covers the two journeys V2 flagged as untested (SOS end-to-end over real sockets, and socket-drop/reconnect with room re-join and cross-tenant leak assertions); secure token storage and crash reporting reach every field app; and the same job status now renders identically across all seven surfaces, in Arabic included.

I looked specifically for corner-cutting in this round's implementations and found none worth reporting. The completion transaction correctly distinguishes CAS-miss (idempotent response) from replica-set-unavailable (logged fallback to the sequential path with outbox protection) from genuine failure (500, nothing written, safe to retry). The outbox worker now increments attempts atomically, unrefs its interval, and drains in-flight work on SIGTERM before the server closes and mongoose disconnects — in both APIs. The test helpers moved to `MongoMemoryReplSet`, which is exactly right given the transaction work. The mongoose version skew — a trap this codebase had already fallen into once — is gone, along with every `clicks-shared/node_modules/mongoose` workaround require.

**What's left is a checklist, not a project:**

1. **Commit and tag.** 248 dirty files against an unchanged HEAD. Three rounds of production-grade work now exist only on one Windows machine. This is the single largest risk in the entire platform.
2. **Rotate the secrets and delete `SECRETS.TRANSFER.md`** (still present, still holding live credentials — UNVERIFIED whether anything has been rotated; assume nothing has).
3. **Set `SENTRY_DSN`** on both Railway services and in the mobile build defines — the wiring is done and PII-scrubbed on the Flutter side; it's dark until the DSN exists.
4. **Let CI run green once.** The workflow is now pinned (`ubuntu-22.04`, `MONGOMS_VERSION=7.0.14`, cached binaries, strict `npm ci`) — push the tree and the suite finally gets to prove the guarantees it encodes.
5. **Technician iOS Firebase** (plist + APNs upload), then a real-device push test.

Do those five and, on the evidence of the code alone, this platform justifies a limited public cohort.

---

## 2. Round 2 Fix Verification (13/13 implemented)

| # | Prompt | Status | What I verified in source |
|---|---|---|---|
| 1 | N-1: technician-credit outbox fallback | ✅ | `clicks-shared/services/technicianCredit.js` — single shared `creditTechnicianForJob(job, {session})`, session-threaded, 11000-tolerant, used by **both** `markCompleted` and the new `OUTBOX_TYPES.TECHNICIAN_CREDIT` dispatch; tech-api worker registers `[PARTNER_ACCRUAL, TECHNICIAN_CREDIT]`; non-transactional path enqueues the credit event on failure; money now runs before the best-effort notify. Dedicated test `technician-credit-outbox.integration.test.js`. |
| 2 | CI binary pinning | ✅ | `tests/helpers/db.js` honours `MONGOMS_VERSION` (default 7.0.14); `ci.yml` integration job pinned to `ubuntu-22.04`, job-level `MONGOMS_VERSION`, `actions/cache@v4` on `~/.cache/mongodb-binaries` keyed by OS+version, and every `npm ci || npm install` replaced with strict `npm ci`. |
| 3 | Secure storage rollout ×3 | ✅ | `flutter_secure_storage` in user/business/partner pubspecs; each `cache_helper.dart` ports the technician pattern (secure read/write/delete + `_migrateLegacyTokens` + plain-API guard); zero plaintext token writes remain outside the migrations; Dio helpers rerouted. |
| 4 | Emit-guard sweep | ✅ | Technician `home_cubit`: 1 → 12 `isClosed` guards; business `login_cubit`: 0 → 4 guards. |
| 5 | Flutter crash reporting | ✅ | `lib/core/monitoring/sentry_config.dart` in technician + user; DSN-gated (no-op when the dart-define is empty); `beforeSend` + breadcrumb scrubbing for tokens/phones/coords; socket + SOS catch blocks instrumented; BUILD.md documents the define. |
| 6 | SOS e2e + reconnect tests | ✅ | `tests/helpers/socket.js`; `sos-e2e.integration.test.js` (createSOS → admin `newSOSRequest` → claim → customer notified; invalid/absent JWT rejected) and `socket-reconnect.integration.test.js` (register → locate → force-disconnect → reconnect/re-register → delivery resumes; wrong technician's location does NOT reach another job's customer). Real `socket.io-client` connections on an ephemeral port. |
| 7 | Outbox lifecycle + atomic attempts | ✅ | `$inc: {attempts: 1}` via findOneAndUpdate; handle tracks `inFlightTick`; `stopOutboxWorker` awaits it; interval `unref()`d; both `index.js` files wire SIGTERM/SIGINT → stop worker → `server.close` → `mongoose.disconnect` → exit, with an unref'd 10s hard-exit fallback. |
| 8 | Status-label drift guard | ✅ | `scripts/check-status-labels.mjs` (CRLF-normalised byte compare, names divergent files); runs as a `check-status-labels` job in the root deploy workflow (deploys `need` it) and in ci.yml. |
| 9 | Flutter status labels | ✅ | `job_status_labels.dart` in technician/user/business mirroring the web map; clicks-user resolves through `job_status.*` keys added to **both** en.json and ar.json (the Arabic is real and register-consistent); display call sites swept, behaviour branches untouched. |
| 10 | Mongoose unification | ✅ | All three packages on `^8.3.5`; **zero** `clicks-shared/node_modules/mongoose` requires remain (src + scripts); deprecated connect options dropped; Dockerfiles/locks regenerated. |
| 11 | Structured logs only | ✅ | `morgan("dev")` gated behind `NODE_ENV === "development"` in both `createApp.js`; `X-Request-Id` set on every response in `observability.js`; per-location socket chatter now `devLog`-gated. |
| 12 | Landing hygiene | ✅ | All four scratch files deleted; `vercel.json` now carries CSP, `X-Content-Type-Options`, `Permissions-Policy` (+ frame/referrer policies), immutable asset caching. |
| 13 | Completion transactions | ✅ | `mongoTransactions.js` util; `runCompletionWithTransaction` (session over Job CAS + `creditTechnicianForJob` + receipt) with three-way error handling: CAS-miss → idempotent 200/status-400; replica-set-unavailable → one-time warn + sequential fallback **with** credit-outbox protection; other errors → 500 with nothing written (whole completion safely retryable). Partner accrual deliberately post-commit. Tests moved to `MongoMemoryReplSet` so the transactional path is exercised; a failure-injection test asserts rollback leaves the job `in_progress` with zero ledger rows. |

**Regression sweep:** the wider diff (seed/QA scripts, backfills, Dockerfiles, splash screens, dio_helpers, notification router) is consistent with the mongoose unification and secure-storage/label adoption — no behavioural regressions identified. All previously verified protections (RBAC, ownership, OTP hardening, finance lock, socket rooms, rate limits) remain intact.

**Residual engineering nits (P3, none blocking):** the `secret-scan`/`api-smoke` CI jobs still run on `ubuntu-latest` (only the integration job is pinned — fine, but pin them for consistency); the earnings suite's guarantees remain *runtime-unproven* until CI executes once; partner-app status labels weren't in scope (it shows no job statuses today — confirm that stays true).

---

## 3. The Unchanged Ops Gate (now the whole story)

Verified this morning on the device: git HEAD is still `35483e3` (predates **all three rounds** of fixes); `git status` reports **248** modified/untracked files (V1: 92 → V2: 172 → now 248 — the laptop-only surface grows every round); `SECRETS.TRANSFER.md` (live Atlas/JWT/SMSala/Firebase credentials) still exists in the working tree. Rotation, `SENTRY_DSN`, Maps-key restrictions, technician `GoogleService-Info.plist`/APNs, and a first green CI run are all still pending and all **UNVERIFIED** from code.

To say it plainly: the platform's most dangerous single point of failure is currently `C:\Users\TS`. Every further round of code work widens that exposure. Commit first.

---

## 4. Updated Scorecard (V1 → V2 → V3)

| # | Category | V1 | V2 | V3 | V3 driver |
|---|---|--:|--:|--:|---|
| 1 | Product completeness | 6.5 | 6.5 | **6.5** | Unchanged scope |
| 2 | UX (multi-app consistency) | 5.0 | 5.5 | **6.5** | Status vocabulary unified across all 7 surfaces, Arabic included |
| 3 | User flows (SOS/dispatch/lifecycle) | 6.5 | 7.0 | **7.0** | — |
| 4 | Security | 6.0 | 6.5 | **6.5** | Capped by unrotated secrets, not by code |
| 5 | Authentication | 6.0 | 7.0 | **7.0** | — |
| 6 | Authorization / RBAC | 7.5 | 7.5 | **7.5** | — |
| 7 | Database (MongoDB) | 5.5 | 6.0 | **6.5** | Transactions on the completion cluster; migrations/PII still open |
| 8 | API / backend | 6.0 | 6.5 | **7.0** | Shared credit service, mongoose unified, graceful shutdown |
| 9 | Frontend / mobile | 5.0 | 6.0 | **6.5** | Secure storage + crash reporting everywhere; labels unified |
| 10 | Performance | 5.5 | 5.5 | **5.5** | Still untested at 10k+ scale |
| 11 | Testing / QA | 3.0 | 5.5 | **6.5** | SOS e2e + reconnect + credit-outbox + rollback-injection suites; replSet harness; still unproven in CI |
| 12 | DevOps / deploy hygiene | 3.0 | 4.5 | **5.0** | CI pinned/cached/strict + drift guard; **hard-capped by the uncommitted tree** |
| 13 | Monitoring / observability | 2.0 | 4.0 | **5.0** | Flutter Sentry wired + scrubbed; clean JSON logs + X-Request-Id; no DSN/alerting yet |
| 14 | Reliability | 5.0 | 6.5 | **7.0** | Credit outbox, atomic attempts, drain-on-SIGTERM |
| 15 | Scalability | 4.5 | 6.0 | **6.0** | Rooms done; Redis + sticky sessions still to enable |
| 16 | Admin / ops tooling | 6.0 | 6.5 | **6.5** | — |
| 17 | Notifications | 5.0 | 6.0 | **6.0** | Tech iOS still blocked on plist/APNs ops |
| 18 | Analytics | 3.0 | 3.0 | **3.0** | Untouched (deliberately deferred) |
| 19 | Documentation | 6.0 | 6.0 | **6.5** | BUILD.md ×3, monitoring docs; API/socket/incident docs still missing |
| 20 | Finance / earnings | 5.0 | 7.0 | **7.5** | Transactional + outbox-reconciled; periodic reconciliation report still a nice-to-have |

**Overall: ≈5.5 (V1) → ≈6.3 (V2) → ≈6.8 (V3)** — the top of "functional production," at the door of "strong production system." Completing the five-item ops gate (§1) with **zero further code** justifies ≈**7.2–7.5**. The two structural ceilings after that are analytics/product intelligence and scale-proofing (load tests, Redis multi-instance, M30) — both correctly Phase 3.

---

## 5. What To Do Now (in order, mostly not code)

1. `git add -A`, commit, tag `v1.0.0-rc1`, push. Then the deploy workflow, the drift guard, and CI all become real.
2. Watch the first CI run; the integration suite (now 8 suites incl. SOS e2e, reconnect, credit-outbox, transaction rollback) must go green before anything ships.
3. Rotate every secret, delete `SECRETS.TRANSFER.md`, restrict every Maps key, set distinct per-env values.
4. Set `SENTRY_DSN` (both Railway services + mobile build defines); repoint Railway health checks to `/api/health`; add an uptime probe + paging channel.
5. Technician iOS: real `GoogleService-Info.plist` + APNs key; verify a push on a physical device.
6. Dogfood 48h → limited cohort, per SOFT_LAUNCH.md. Phase 3 (analytics taxonomy, load tests, Redis multi-instance, httpOnly cookies, PII-at-rest) proceeds after launch stabilises.

---

*V3 prepared from static inspection of a fresh device snapshot diffed against the V2 baseline. UNVERIFIED: secret rotation, deployed Railway/Vercel state, CI execution on GitHub runners, iOS push on device, Maps-key restrictions. The integration suite could not execute in this sandbox (mongod binary host unreachable — environmental); its logic is verified by inspection. No code was modified during this audit.*
