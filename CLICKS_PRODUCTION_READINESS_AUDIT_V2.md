# Clicks Platform — Production-Readiness Re-Audit (V2)

**Prepared for:** Clicks (Be Electric, Qatar) leadership / engineering
**Date:** 20 August 2026
**Baseline:** V1 audit of 19 August 2026 (`CLICKS_PRODUCTION_READINESS_AUDIT.md`). This V2 re-inspects the **current** working tree, which has changed substantially since V1: the remediation prompts have been applied across both APIs, the shared package, all three web portals, and all four Flutter apps (113 files added/changed vs the V1 snapshot).
**Method:** Direct source inspection of a fresh snapshot staged from the connected machine, diffed file-by-file against the V1 snapshot, with each fix read and verified individually. I attempted to **execute** the new integration test suite in the audit sandbox; it could not run here because the sandbox blocks the MongoDB test-binary download (details in §5) — test *logic* is verified by inspection and marked accordingly. Deployed production endpoints were not live-probed. Anything not directly verifiable is marked **UNVERIFIED**. No code was modified.

> **Verdict in one line:** The codebase has moved from **≈5.5/10 to ≈6.3/10** — every code-level P0 and most P1s from V1 are now genuinely fixed and fixed *correctly* — but the platform's biggest remaining risk is no longer in the code: **none of this is committed to git (HEAD is unchanged; 172 dirty files), the plaintext secrets file still exists, and rotation/DSN/APNs ops steps are still pending.** One `git commit` + the ops checklist now stands between Clicks and a defensible soft launch.

---

## 1. Executive Summary

**Is Clicks production-ready for a Qatar public launch? Not yet — but it is now materially closer, and the remaining gap is dominated by operations, not engineering.**

Since V1, the team has applied a broad, high-quality remediation pass. I verified each fix in the source, looking specifically for "prompt-shaped but wrong" implementations — and found the opposite: the fixes are implemented with real care (atomic compare-and-set on completion, a database-level unique-index ledger, adapter-aware socket presence checks, a multi-instance-safe outbox claim with stale-reclaim). The three headline conclusions:

1. **The money path is now safe.** The technician-earnings double-credit race (V1 P0-3) is closed twice over: job completion is an atomic `findOneAndUpdate` on `job_status: "in_progress"`, and earnings are additionally guarded by a new `TechnicianEarningEntry` ledger with a **unique index on `job_id`** — duplicate-key errors skip the credit. Finance audits are now **locked** (409 on re-audit/re-edit), with an append-only `FinanceAuditLog` and an explicit, logged reopen path. Partner accrual failures now enqueue a durable retry instead of vanishing into a log line.

2. **The reliability and security floor is dramatically higher.** Sentry is initialised (DSN-gated) in both APIs including socket handlers; health checks are real readiness probes (503 on DB down, Redis checked when configured) with a separate liveness endpoint; all three previously-unthrottled logins (business/finance/partner) now share the auth rate limiter; the admin portal handles 401s, revokes refresh tokens on logout, and its XSS sinks are DOMPurify-sanitised; `/demo` is deleted; the socket layer was refactored from per-process Maps to per-user rooms, making the documented Redis horizontal-scale path actually workable; and an `AdminAuditLog` now answers "who did what to which job/lead/SOS, when, from where."

3. **The remaining blockers are operational, and they are serious.** The git HEAD has not moved — **every one of these fixes exists only as uncommitted changes on one Windows machine.** `SECRETS.TRANSFER.md` (live production credentials, two Firebase private keys) still sits in the working tree, and nothing in code can prove rotation has happened (UNVERIFIED — assume not). The new tag-based deploy workflow is meaningless until the tree is committed. Sentry has no DSN set, Flutter has no crash reporting, the technician iOS `GoogleService-Info.plist` and APNs key are still pending, and secure token storage has (deliberately, per the review-one-app-first plan) only reached the technician app so far.

**Bottom line:** Phase 0 is no longer "fix the code" — it is **commit, rotate, configure, and prove**. Specifically: commit the entire tree and tag it; rotate every secret and delete the transfer file; set `SENTRY_DSN` on both Railway services; run the new test suite green in CI (with the binary-pinning fix in §5); and complete the technician iOS Firebase/APNs setup. After that, a limited public cohort is defensible.

---

## 2. Fix-by-Fix Verification Matrix

Status legend: ✅ **VERIFIED** (read in source, implemented correctly) · ⚠️ **VERIFIED WITH CAVEAT** · ⏳ **PARTIAL / IN PROGRESS** · ❌ **NOT DONE** · 🔍 **UNVERIFIED** (cannot confirm from code)

| # | V1 finding | Status | Evidence & notes |
|---|---|---|---|
| P0-1 | Live secrets in `SECRETS.TRANSFER.md`; shared across envs; committed client keys | ⏳/🔍 | Code side largely done: `.gitignore`s extended; `clicks-user/ios/Runner/Info.plist` Maps key is now a `$(GOOGLE_MAPS_API_KEY)` build setting with `Secrets.xcconfig.example`; env examples updated. **But the transfer file still exists in the tree (14.5 KB), and rotation cannot be verified from code — treat all secrets as still compromised until rotated.** |
| P0-2 | Zero observability on SOS path | ⚠️ | `clicks-shared/middleware/sentry.js` (DSN-gated init, request + error middleware, request-id tag) wired in both `createApp.js`; `captureException` added in socket catch blocks and the outbox worker. `/api/health` now returns 503 when `mongoose.connection.readyState !== 1`, checks Redis when configured; `/api/health/live` split out. **Caveats:** no DSN set yet (so still dark in production); no Flutter Crashlytics/Sentry; no pager/synthetic SOS probe. Railway health-check path must be pointed at readiness. |
| P0-3 | Technician-earnings double-credit race | ✅ | `markCompleted` now: validations → atomic `Job.findOneAndUpdate({_id, job_status:"in_progress"}, …)` → on null, idempotent 200 ("already completed") or status-specific 400 → downstream effects only on match. Plus `TechnicianEarningEntry` (unique `job_id`) created first; duplicate-key 11000 skips all `$inc`s. Concurrent double-complete is covered by a dedicated test (`tests/integration/earnings-idempotency.integration.test.js`, incl. `Promise.all` case). |
| P0-4 | Deploy from uncommitted laptop tree | ⏳ | Root `.github/workflows/deploy-production.yml` exists (tag-triggered, per-service, no runtime `railway.toml` mutation, exports `GIT_SHA`); old PS1 scripts marked deprecated. **But git HEAD is unchanged and the tree now has 172 dirty files — production provenance is *worse* until everything is committed and the workflow becomes the only deploy path.** |
| P1-1 | No finance double-audit lock | ✅ | `financePortalController`: both `updateFinance` and `auditJob` return **409 "Job is audited and locked. Reopen it first."** when `finance_status === "audited"`; append-only `FinanceAuditLog` written on update/audit/reopen; `POST /jobs/:id/reopen` (logged, TODO senior-role note) and `GET /jobs/:id/history` added and routed. Covered by `finance-lock.integration.test.js`. |
| P1-2 | Unthrottled business/finance/partner logins | ✅ | `authLimiter` now first middleware on all three login routes (`businessPortal.js:9`, `financePortal.js:7`, `partnerPortal.js:7`). |
| P1-3 | Admin 401 bug; client-only logout; silent portal expiry | ✅ | Admin `apiSlice` refreshes on **401 or 403**, logs out if refresh fails, excludes auth endpoints from the loop; `AdminSidebar.handleLogout` awaits the `/auth/logout` mutation (with refresh token) before clearing state; business & finance login pages show "Your session expired — please sign in again." Tokens remain in localStorage by design (documented TODO → httpOnly cookies). |
| P1-4a | Plaintext JWT in SharedPreferences (4 apps) | ⏳ | **Technician done properly**: `flutter_secure_storage ^11`, secure read/write/delete, one-time migration of legacy tokens out of SharedPreferences, guard that throws if a secure key is written via the plain API, cached sync reads. **clicks-user, clicks-business, clicks-partner not yet migrated** (0 references) — this was the agreed review-first sequencing; roll the pattern out now. |
| P1-4b | Technician iOS push broken; camera crash; no socket reconnect | ⚠️ | Info.plist: `remote-notification` background mode + `NSCameraUsageDescription` + `NSPhotoLibraryUsageDescription` added; `README-FIREBASE.md` documents the plist step; AppDelegate updated. Socket service: `enableReconnection()`, `onReconnect` re-emits `register`. **Caveats (ops):** real `GoogleService-Info.plist` + APNs key upload still pending — iOS push remains non-functional until done. |
| P1-4c | Partner Android 13+ notifications & background FCM | ✅ | `POST_NOTIFICATIONS` in manifest; `@pragma('vm:entry-point')` background handler registered via `FirebaseMessaging.onBackgroundMessage` in `main.dart`; `getInitialMessage` killed-state routing; `onTokenRefresh` re-registration. |
| P1-4d | Release builds default to emulator localhost | ✅ | Both `app_config.dart` files: `kReleaseMode` guard throws `StateError` unless a valid explicit config is provided; https enforced for non-local; production URL is the release default; `BUILD.md` added to both apps. |
| P1-4e | Emit-after-await crashes | ⏳ | `sos_cubit.dart` now has 15 `isClosed` guards ✅. **Not yet extended** to `clicks-technician` `home_cubit.dart` (still ~1 guard) or `clicks-business` `login_cubit.dart` (0) — the follow-up list from the fix still needs doing. |
| P1-5 | Best-effort cross-API notify; silent partner under-payment | ✅ | `OutboxEvent` model (+ compound index, `claimed_at` lock field); `outboxWorker` with atomic `findOneAndUpdate` claim, 5-min stale reclaim (multi-instance safe), 30s→2m→10m→1h backoff, 8-attempt cap, Sentry on exhaustion; enqueue on failure in `businessPortalController` (admin popup) and `markCompleted` (partner accrual); each API starts the worker for only its own types (admin: business-notify; tech: partner-accrual) after Mongo connects. |
| P1-6 | Sockets can't scale horizontally (per-process Maps) | ✅ | `sosSocketService` fully refactored: **zero** `technicianSockets`/`customerSockets` map targeting remains; all targeted emits via `emitToUser` → `namespace.to('user:<id>')`; presence via adapter-aware `fetchSockets()`; join on register from JWT identity; the nuanced offline-grace/heartbeat/On-Job-stale logic preserved and now double-checks liveness **across instances** before flipping Offline. Redis + sticky sessions are now the genuine remaining prerequisites to `TECH_API_INSTANCES > 1`. |
| P2-1 | No real CI tests | ⚠️ | Real suite added: Jest + supertest + mongodb-memory-server, `createApp.js` factory splits in both APIs (listen-free, test-importable), 5 integration suites (OTP security incl. operator-injection & attempt caps; RBAC dispatcher/technician; job lifecycle + proximity; earnings idempotency incl. concurrency; finance lock incl. reopen), FCM/SMS/axios mocked, wired into `ci.yml` as an `integration-tests` job. **Caveats:** see §5 — the suite could not be executed in this sandbox (blocked binary download), and the same download is a CI fragility: pin `MONGOMS_VERSION` to a version that exists for the runner distro and cache the binary. Also `npm ci || npm install` silently tolerates lockfile drift. |
| P2-3 | Divergent status labels | ✅ (web) | `jobStatusLabels.js` — **byte-identical** (same MD5) in all three portals — replaces the hardcoded admin strings and the misplaced `phone.js` helpers; `JobStatusPill` components added. Flutter apps still have their own strings (follow-up). |
| P2-4 | No admin audit trail | ✅ | `AdminAuditLog` model; `recordAudit` helper (never-throw); wired into admin job create/update/delete/cancel, lead convert/lost, SOS claim; `GET /api/admins/audit-log` behind `requireFullAdmin` with pagination/filtering. |

**Regression sweep:** the diff surface beyond the intended fixes (Dashboard, HeatMap, SOSInbox, JobDetails, ImportJobsModal, StatusPill, `firebase_options.dart`, gradle wrappers) is consistent with label-map adoption, Sentry/config threading, and key-placeholder changes; no behavioural regressions identified by inspection. The V1 strengths (server-side RBAC on every route, ownership checks, hardened OTP, sanitize/coerce, partner-earning idempotency) are intact.

---

## 3. New Findings (introduced or surfaced by the fixes)

**N-1 (P2, money-path completeness) — A transient failure between completion and credit can permanently strand a technician's earnings.** In the new `markCompleted`, the job is atomically flipped to `completed` **before** the customer notify, partner accrual, and technician credit run. If the ledger insert or aggregate `$inc` throws for any reason *other* than duplicate-key (e.g. a momentary Atlas blip), the client gets a 500 — but a retry now hits the CAS guard, receives the idempotent "already completed" 200, and **never credits**. Partner accrual got an outbox fallback; the technician credit did not. *Fix: mirror the partner pattern — wrap the technician-credit block in try/catch and enqueue a `technician_credit` outbox event (idempotent via the ledger's unique index) on failure. Same for the awaited customer notify: credit money before, or isolate, best-effort notifications.*

**N-2 (P1, CI reliability) — The integration suite's MongoDB binary download is fragile.** In the sandbox, `mongodb-memory-server` failed with 403 fetching `mongodb-linux-x86_64-ubuntu2204-7.0.24.tgz` (egress-blocked here — but the same class of failure hits GitHub runners whenever the auto-resolved version/distro combo doesn't exist, e.g. after `ubuntu-latest` moves to 24.04). Until the suite has run green in CI at least once, treat all test-backed claims in §2 as *verified by inspection, unproven at runtime*. *Fix: pin `MONGOMS_VERSION` (choose one published for the runner distro), cache `~/.cache/mongodb-binaries` in Actions, and replace `npm ci || npm install` with plain `npm ci` so lockfile drift fails loudly.*

**N-3 (P2, worker hygiene) — Outbox worker lifecycle.** The interval returned by `startOutboxWorker` is never stored/cleared, and the admin worker starts before `app.listen` — harmless today (single process, fail-fast bootstrap), but add graceful-shutdown clearing when PM2/Railway restarts become more frequent. Also `attempts` is read from the in-memory event object rather than `$inc`'d atomically; with the claim lock this is safe in practice, but an atomic `$inc` would be strictly correct.

**N-4 (P3, consistency) — The three `jobStatusLabels.js` copies are identical today** but have no drift guard. A trivial CI step (hash-compare the three files) would preserve the invariant the header comment asks for.

---

## 4. What Remains Open (the real launch gate)

**Ops/P0 — nothing here is code:**
1. **Commit everything and tag it.** HEAD `35483e3` predates every fix; 172 dirty files. Until committed, the laptop is still the single point of failure, the deploy workflow is inert, and "production provenance" is worse than V1 because even more value is uncommitted.
2. **Rotate all secrets; delete `SECRETS.TRANSFER.md`** (still present). Atlas passwords, JWT + refresh + internal secrets, SMSala token, all Maps keys, both Firebase service accounts. Restrict keys (referrer / package + SHA-1 / bundle id). Rotation is 🔍 UNVERIFIED from code — assume compromised until done.
3. **Turn the lights on:** set `SENTRY_DSN` on both Railway services; point Railway health checks at `/api/health` (readiness); add an uptime/synthetic SOS probe + a paging channel.
4. **Technician iOS:** drop in the real `GoogleService-Info.plist`, upload the APNs key, verify a push on a physical device.
5. **Run CI green once** (with N-2's pinning) so the new suite's guarantees are proven, not just read.

**Engineering/P1–P2 still open from V1:** secure storage rollout to user/business/partner apps; `isClosed` guards in technician `home_cubit` + business `login_cubit`; Flutter crash reporting (Crashlytics or Sentry); MongoDB transactions on the completion cluster (P2-2 — partially obviated by the ledger but still worthwhile); mongoose version skew (`clicks-shared` ^7 vs APIs ^8) unchanged; PII-at-rest & retention; formal migrations; technician-app Arabic; Flutter status-label unification; OpenAPI + socket-event catalog + incident runbook; analytics event taxonomy; landing scratch files & security headers; `morgan("dev")` still alongside JSON logs.

---

## 5. Testing Note (execution attempt)

I installed all workspace dependencies and ran `npm test` in the staged copy. All 5 suites / 12 tests failed identically at environment setup: `mongodb-memory-server` could not download the mongod binary (`fastdl.mongodb.org` unreachable from this sandbox; 403 via proxy for both the auto-resolved 7.0.24 and a pinned 7.0.14). No assertion in any suite was reached, so **no test-logic failures were observed** — and none could be confirmed either. The suites themselves are well-constructed (real HTTP through supertest against the actual apps; the earnings test asserts ledger-row count, aggregate totals, and the concurrent case; mocks confine side effects). Proving them green in GitHub Actions — after applying N-2 — is a Phase-0 item, not optional.

---

## 6. Updated Scorecard (V1 → V2)

| # | Category | V1 | V2 | Movement driver |
|---|---|--:|--:|---|
| 1 | Product completeness | 6.5 | **6.5** | No feature scope change |
| 2 | UX (multi-app consistency) | 5.0 | **5.5** | Unified web status labels; session-expired messaging; Flutter labels pending |
| 3 | User flows (SOS/dispatch/lifecycle) | 6.5 | **7.0** | Tech socket reconnect; SOS cubit crash guards; durable popup delivery |
| 4 | Security | 6.0 | **6.5** | Rate limits, DOMPurify, `/demo` removed, key placeholders; secrets unrotated caps it |
| 5 | Authentication (multi-portal) | 6.0 | **7.0** | 401 refresh, server-side logout revocation, throttled logins; localStorage remains |
| 6 | Authorization / RBAC | 7.5 | **7.5** | Was already strong; audit log adds accountability |
| 7 | Database (MongoDB) | 5.5 | **6.0** | Unique-index ledger, append-only logs; still no transactions/PII/migrations |
| 8 | API / backend | 6.0 | **6.5** | Atomic transitions, outbox, app factories; duplication remains |
| 9 | Frontend / mobile (7 clients) | 5.0 | **6.0** | Tech secure storage + iOS fixes + fail-closed builds; 3 apps' storage pending |
| 10 | Performance | 5.5 | **5.5** | Unchanged (untested at 10k+ scale) |
| 11 | Testing / QA | 3.0 | **5.5** | Real integration suite in CI covering the five critical behaviours; unproven at runtime (§5); no SOS-e2e/socket-reconnect tests yet |
| 12 | DevOps / deploy hygiene | 3.0 | **4.5** | Tag-deploy workflow authored; **capped hard by the uncommitted tree** |
| 13 | Monitoring / observability | 2.0 | **4.0** | Sentry wired + real readiness checks; no DSN, no Flutter crash reporting, no alerting yet |
| 14 | Reliability (sockets/SMS/FCM) | 5.0 | **6.5** | Outbox with retry, tech reconnect, partner background FCM |
| 15 | Scalability | 4.5 | **6.0** | Rooms refactor makes the Redis path real; Redis/sticky sessions still to enable |
| 16 | Admin / ops tooling | 6.0 | **6.5** | Attributable audit log + query endpoint |
| 17 | Notifications | 5.0 | **6.0** | Partner fixed; tech iOS declared but blocked on plist/APNs ops |
| 18 | Analytics | 3.0 | **3.0** | Untouched |
| 19 | Documentation | 6.0 | **6.0** | BUILD.md/README-FIREBASE added; API/socket/incident docs still missing |
| 20 | Finance / earnings readiness | 5.0 | **7.0** | Audit lock + history + reopen; ledger idempotency; N-1 residual |

**Overall: ≈ 5.5 → ≈ 6.3 / 10 — upper end of "Functional production (soft launch)."**
Conditional trajectory: completing the five ops items in §4 (commit/tag, rotation, DSN + alerting, tech-iOS Firebase, CI green) with no new code would justify **≈ 6.8–7.0** — the "strong production system" threshold. The honest ceiling until then stays at 6.3, because unrotated secrets and an uncommitted production codebase are not code-quality issues but they are absolutely launch-readiness issues.

---

## 7. Reprioritised Roadmap

**Phase 0 — this week (ops-dominated):**
(1) Commit the entire tree, tag `v1.0.0-rc1`, make the workflow the only deploy path. (2) Rotate every secret; delete the transfer file; restrict keys. (3) Set `SENTRY_DSN` both services; switch Railway health checks to readiness; stand up a synthetic SOS probe + pager. (4) Technician iOS plist + APNs; verify push on-device. (5) Fix N-2 (pin `MONGOMS_VERSION`, cache binaries, plain `npm ci`) and get CI green.

**Phase 1 — next 2–3 weeks:**
(6) N-1: outbox fallback for technician credit; reorder credit before best-effort notifies. (7) Secure-storage rollout to user/business/partner. (8) `isClosed` sweep in tech `home_cubit` + business `login_cubit`. (9) Crashlytics/Sentry in customer + technician apps. (10) Add SOS-e2e and socket-reconnect integration tests. (11) Dogfood 48h → limited cohort per SOFT_LAUNCH.md.

**Phase 2 — pre-multi-city:** transactions on the completion cluster; mongoose version unification; PII/retention strategy + migrations tool; Flutter status labels + technician Arabic; OpenAPI + socket catalog + incident runbook; Redis + sticky sessions → `TECH_API_INSTANCES > 1`; N-3/N-4 hygiene.

**Phase 3:** analytics taxonomy + SLA dashboards; load tests at 10k+ jobs; httpOnly-cookie migration for web portals; business web/Flutter contract consolidation.

---

## 8. Top 5 Actions (ranked, this week)

1. **`git add -A && git commit` — then tag.** Every fix in this report is one disk failure away from not existing.
2. **Rotate all secrets and delete `SECRETS.TRANSFER.md`.** Until then, V1's P0-1 remains fully open regardless of code quality.
3. **Set `SENTRY_DSN` + repoint health checks + add a pager.** The 2 a.m. SOS question is only answered when the wiring is switched on.
4. **Make CI green** (pin the mongod binary) so the new safety net is proven, then treat a red build as a deploy blocker.
5. **Finish technician iOS push** (plist + APNs) — the last broken leg of the dispatch notification path.

---

*V2 prepared from static inspection plus an attempted test execution of the staged working tree, diffed against the V1 snapshot. UNVERIFIED items: secret rotation status, deployed Railway/Vercel state vs this tree, Maps-key restrictions, CI execution on GitHub runners, iOS push on device. No code was modified during this audit.*
