# Customer app store launch gaps — business cases and operational holes

Research date: 13 November 2026. Scope: Clicks customer product (`clicks-user` + customer/tech API + shared services) vs App Store / Play Store launch. Method: static re-read of this working tree, cross-checked against the 7 Nov 2026 failure-scenario audit and the same-day lifecycle QA note. No live Railway env dump was available in this pass; production flag values are taken from the 13 Nov QA probe.

Three layers are kept distinct throughout:
- **This working tree** (uncommitted customer/API edits plus committed code as of 13 Nov 2026).
- **Local-only QA branch** `fix/customer-qa-2026-11-13` (worktree `.claude/worktrees/customer-qa`, based on `6e5afc0`): bugs 1–5 marked FIXED there; **not pushed, not merged, not deployed**.
- **Production flags / config** as probed on 13 Nov 2026 against live Railway.

The 19 August 2026 production-readiness audit is treated as historical. Several of its customer findings are stale (SOS e2e tests now exist; `google-services.json` is now *missing* rather than committed; identity/money/realtime fix branches have landed in the tree). Prefer current code.

---

## Which of the 100 failure scenarios in CLICKS_CUSTOMER_FAILURE_SCENARIOS.md are still launch blockers (YES) as of the current working tree on 13 Nov 2026?

### Takeaway
The 7 Nov audit listed **45 YES blockers plus the technician-exposure issue**. Most of those are **no longer YES in this working tree**: identity, OTP, token refresh, deletion guards, SOS unique index + escalation, payments/refunds/reconciler, membership checkout locks, Contact Us, nearby-technician privacy, and forced-update *code* have landed. What remains as a **store / first-public-push blocker in this tree** is a short list: unanswered-SOS ops (escalation exists but SOS never expires), cold-start stuck in-progress (#58 / QA bug 1), Android/iOS push files missing (#69), Pay-now shown while SkipCash is off (QA bug 3), past-due bookings taking over the session (QA bug 4 / related to #54), technician still able to mark card/wallet/Fawran as collected (#85), and production config that cannot force-update or page a real support number (#19, #41). Several other original YES items are **handled in code but off or unverified in production**.

### Cited Findings

**Source document (7 Nov 2026, static, no live servers):**
- The audit judged **45 of 100 scenarios launch blockers (YES)**, plus a separate technician-exposure finding, ~30 distinct fixes. — [CLICKS_CUSTOMER_FAILURE_SCENARIOS.md](file:///c:/Users/TS/Downloads/clicks-workspace/CLICKS_CUSTOMER_FAILURE_SCENARIOS.md)
- Original YES list: 1, 4, 6, 9, 11, 12, 19, 24, 27, 29, 30, 31, 37, 38, 39, 41, 42, 43, 44, 45, 48, 50, 51, 54/55, 58, 66, 67, 69, 77, 78, 79, 80, 81, 82, 83, 85, 89 (if memberships launch), 90, 91 (policy), 93/94 (if memberships launch), 98, 99, 100, plus nearby-technicians. — [CLICKS_CUSTOMER_FAILURE_SCENARIOS.md](file:///c:/Users/TS/Downloads/clicks-workspace/CLICKS_CUSTOMER_FAILURE_SCENARIOS.md) (Launch-blocker list, lines 1061–1057)

**Same-day QA (13 Nov 2026) retested five of those YES items against production:**
- #12 token expiry: **FIXED on production**. Token lifetime 7 days; `POST /api/customers/token/refresh` returns 200. — [qa-customer-lifecycle-2026-11-13.md](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md)
- #19 forced update: **PARTIAL**. `/api/config/public` is live, but `min_app_version` and `store_url` are **null for both platforms**, so a forced update cannot fire. — [qa-customer-lifecycle-2026-11-13.md](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md)
- #27 `LAUNCH_PUBLIC_SOS`: **PASS**. `publicSos=true`. — [qa-customer-lifecycle-2026-11-13.md](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md)
- #31 GPS denied/slow: **PASS**. Pin confirmation is required when the fix is unreliable. — [qa-customer-lifecycle-2026-11-13.md](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md)
- #58 lost signal while technician completes: **STILL BROKEN** on the cold-start path (bug 1); app resume does resync. A socket fix exists on unpushed `scale/p1-customer-app` (`d198d53`) and was re-fixed on unpushed `fix/customer-qa-2026-11-13`. — [qa-customer-lifecycle-2026-11-13.md](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md)

**Critical-path recheck in this working tree (13 Nov 2026):**

*Account delete (#3, #4, #5) — HANDLED in this tree, not a store blocker for “no delete button”:*
- Customer schema now has `deleted_at`, `deleted_reason`, `anonymized_at`, `deletion_request`, `token_version`. — [Customer.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-shared/models/Customer.js)
- `deleteAccount` blocks live SOS, live job, active booking, and unpaid job; cancels active/pending memberships with policy `forfeit_no_refund`; bumps `token_version`. `GET /api/customers/delete-check` exists for the dialog. — [customerController.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-customer-tech-api/src/controllers/customerController.js)
- App Settings listens for `ErrorDeleteAccountSettingsState` and shows a blocked dialog (scenario 5). Delete Account is in the profile sheet. — [settings_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/settings/ui/view/settings_screen.dart)
- A 30-day anonymiser runs from the tech API boot. — [anonymiseDeletedCustomers.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-shared/services/anonymiseDeletedCustomers.js); started in [index.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-customer-tech-api/src/index.js)
- Restore-on-re-register with OTP is implemented when `deleted_at` is set and `anonymized_at` is not. — [customerController.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-customer-tech-api/src/controllers/customerController.js)

*OTP / register (#1, #9, #11) — HANDLED in this tree:*
- Register requires OTP and the app now sends `"otp": otpController.text.trim()` on register. — [customerController.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-customer-tech-api/src/controllers/customerController.js); [register_cubit.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/auth/register/ui/cubit/register_cubit.dart)
- SMSala 2xx bodies with errors are treated as failed sends; production refuses `SMS_PROVIDER=console`. — [smsService.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-customer-tech-api/src/services/smsService.js)
- Per-phone cap default 3/hour and 10/day; OTP restricted to +974. — [otpSendGuard.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-shared/utils/otpSendGuard.js)
- Last-8-digit fallback applies **only** to unambiguous Qatar numbers (scenario 6). — [phone.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-shared/utils/phone.js)
- 13 Nov QA **skipped** the live register/OTP path because it sends real SMS and creates a real production account. — [qa-customer-lifecycle-2026-11-13.md](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md)

*Token refresh (#12) — HANDLED in this tree and confirmed on production:*
- `POST /api/customers/token/refresh` with grace window and `token_version` revocation. — [customerController.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-customer-tech-api/src/controllers/customerController.js)
- Splash calls `AuthSession.refreshIfNeeded()`. — [splash_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/splash/splash_screen.dart)

*SOS unanswered (#38, #39, #40) — CODE HANDLED for escalation; NOT HANDLED for auto-expiry; production evidence mixed:*
- `schedulePendingExpiry`, `scheduleInCallExpiry`, and `sweepStaleSos` are still **no-ops**: “the SOS request itself never auto-expires”. — [sosSocketService.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-customer-tech-api/src/services/sosSocketService.js)
- A separate sweeper now implements the 7 Nov ladder: pending ≥2 min re-push dispatchers; ≥5 min SMS on-call (or all admins if none configured); ≥8 min tell the customer to tap-to-call; `in_call` with no job ≥5 min releases the claim. Lease-guarded. — [sosEscalation.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-shared/services/sosEscalation.js)
- 13 Nov QA found a **pending SOS from another customer (`#2147A7A5`, 8 Nov, level 3)** still sitting in the inbox, with admin age shown as `"127717:19"`. Level 3 means the customer-notify step of the ladder had already run; the SOS was not closed. — [qa-customer-lifecycle-2026-11-13.md](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md)
- Unique partial index `uniq_active_sos_per_customer` exists in the schema; comment says **production runs with autoIndex off — `sync-indexes` must build it** (scenario 29). Whether Atlas has that index was not verified in this pass. — [SOSRequest.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-shared/models/SOSRequest.js)

*GPS / coverage (#31, #32) — PARTIAL / QA PASS:*
- SOS create accepts `accuracy_m`, `fix_time`, `location_source` (`gps` | `manual_pin`). — [sosSocketService.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-customer-tech-api/src/services/sosSocketService.js)
- Coverage is still a Qatar **bounding box**, not a land polygon; NYC pin was rejected `400 OUTSIDE_COVERAGE` in the 13 Nov QA. — [qatarCoverage.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-shared/utils/qatarCoverage.js); [qa-customer-lifecycle-2026-11-13.md](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md)

*After-hours (#37) — policy stamped 24/7 in public config; customer still not shown `after_hours`:*
- `GET /api/config/public` returns `dispatch_hours: "24/7"` with comment “Dispatch is staffed 24/7 (decision, 7 Nov 2026)”. — [configRoutes.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-customer-tech-api/src/routes/configRoutes.js)
- SOS still stamps `after_hours` / `next_open_at` from Qatar business hours. — [qatarBusinessHours.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-shared/utils/qatarBusinessHours.js)
- Whether a human dispatcher is actually on a desk at 02:00 was **not verified**. If ops is not 24/7, #37 remains a YES.

*Payment, SkipCash, membership (#77–94, #83) — HANDLED in code; **off in production**:*
- `PaymentAttempt` model, checkout lock `CHECKOUT_BUSY`, cash blocked while a card session is open (`CARD_PAYMENT_RECEIVED`), 5-minute payment reconciler, finance refund routes, membership checkout does **not** cancel older pending links. — [jobPayment.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-shared/services/jobPayment.js); [paymentReconciler.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-shared/services/paymentReconciler.js); [membershipController.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-customer-tech-api/src/controllers/membershipController.js); [financePortal.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-admin-api/src/routes/financePortal.js)
- 13 Nov production flags: `customerMembership=false`, `skipcash=false`. Membership checklist G was **SKIP**. Card Pay-now still appeared and `POST /jobs/:id/skipcash/session` returned `503 SKIPCASH_DISABLED` (bug 3). — [qa-customer-lifecycle-2026-11-13.md](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md)
- In **this working tree**, in-progress still always shows the Pay-now button; `PublicConfig.load()` stores `public_sos` only, not `flags.skipcash`. — [job_in_progress_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/home/job_in_progress_screen.dart); [public_config.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/core/config/public_config.dart)
- QA branch `fix/customer-qa-2026-11-13` **hides** Pay-now when SkipCash is off. That fix is **not in this tree**. — [qa-customer-lifecycle-2026-11-13.md](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md)
- Technician `confirmPayment` still accepts `card`, `wallet`, or `fawran` with no provider reference (scenario 85). Cash is blocked only while a SkipCash attempt is pending. — [jobController.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-customer-tech-api/src/controllers/jobController.js)

*Cancel fees (#64, #92) — FLAG ONLY, still not collected:*
- Server policy: `pending`/`assigned`/`accepted` free; `en_route`/`arrived` `CANCEL_FEE`; `on_hold` contact support. `CUSTOMER_CANCEL_FEE_QAR` may be unset (`fee_amount` then null). Comment: “Fee is a flag only — collection is a later product decision.” — [customerCancelPolicy.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-shared/utils/customerCancelPolicy.js)
- 13 Nov QA: cancel label changes from “Cancel this job” (assigned) to “Cancel (fee may apply)” (en route). **No job was cancelled.** — [qa-customer-lifecycle-2026-11-13.md](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md)

*Overdue bookings (#54 related, QA bug 4) — STILL BROKEN in this tree:*
- `SCHEDULED_OVERDUE_GRACE_MS` / “Booking past its time” **does not appear** in this working tree’s `customerBookingGuard.js`. A pending scheduled booking remains `session_kind=scheduled`. — [customerBookingGuard.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-shared/utils/customerBookingGuard.js)
- Production demo customer still had pending bookings dated 28 Oct and 11 Nov driving every login. QA branch fixed this with a 6-hour grace; **needs tech API deployed**; “the app change alone only fixes the Home title.” Dispatch still gets **no alert** for an overdue booking. — [qa-customer-lifecycle-2026-11-13.md](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md)

*Unpaid jobs vs SOS (#91) — POLICY CHANGED, HANDLED as coded:*
- Session now returns `can_book_sos: !activeSos` and `outstanding_balance`; unpaid no longer blocks SOS. Comment: “An unpaid balance no longer blocks an SOS; it is shown instead.” — [customerBookingGuard.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-shared/utils/customerBookingGuard.js)

*Cold-start in-progress (#58 / bug 1) — STILL BROKEN in this tree:*
- `ensureConnected()` is called from Home, tracking, finding-technician, and service-waiting — **not** from splash or `job_in_progress_screen`. In-progress has no 15 s poll; it only resyncs on hold/completed socket events. — [splash_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/splash/splash_screen.dart); [job_in_progress_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/home/job_in_progress_screen.dart)
- QA: cold-start mid-job never opens the socket; after cash confirm + complete the screen stayed “Job is in Progress” 30+ s. **Fixed on unpushed `fix/customer-qa-2026-11-13`.** — [qa-customer-lifecycle-2026-11-13.md](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md)

*Forced update (#19) — CODE IN FIRST STORE BUILD; production values null:*
- App splash blocks on `PublicConfig.updateRequired`; API `appVersionGate` returns 426 `APP_UPDATE_REQUIRED`. Env `MIN_APP_VERSION_IOS/ANDROID` unset → `null` (no minimum). — [appVersion.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-customer-tech-api/src/utils/appVersion.js); [force_update_screen.dart](file:///c:/Users/TS/Downloads/clicks-user/lib/features/splash/force_update_screen.dart) (path: `clicks-user/lib/features/splash/force_update_screen.dart`)

*Nearby technicians (post-100) — HANDLED in this tree:*
- Customers get `count` + rounded `nearest_km` only; no names, phones, or coordinates; radius capped; no-coords → 400. — [nearby-technicians-access.integration.test.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/tests/integration/nearby-technicians-access.integration.test.js)

*Contact Us (#100) — HANDLED in this tree (admin inbox + ticket number); live admin round-trip not re-run on 13 Nov.*
- Customer POST/GET `/api/contact-us`; admin integration test “customer submit returns a ticket number… writes the inbox”. 13 Nov CI: that test **failed once as a timing flake**, passed 2/2 when rerun 12 Nov. — [contact-us-admin.integration.test.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/tests/integration/contact-us-admin.integration.test.js); [qa-customer-lifecycle-2026-11-13.md](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md)

*Vehicle mass assignment (#24) — HANDLED:* `pick(req.body, EDITABLE_VEHICLE_FIELDS)`. — [vehicleController.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-customer-tech-api/src/controllers/vehicleController.js)

*Admin cancel (#50) — HANDLED:* `POST /:id/cancel` on admin jobs exists. — [jobs.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-admin-api/src/routes/jobs.js)

*Activity UTC (#99) — HANDLED:* `toLocal()` on activity history dates. — [job_history_response.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/activity/models/job_history_response.dart)

*Logout (not in the 100; QA bug 2) — STILL BROKEN in this tree without Firebase:* uncaught `FCMNotificationService.deleteToken()` when Firebase is not initialised; Settings stays after logout. QA branch fixed it. **Android builds without `google-services.json` are very likely affected.** — [qa-customer-lifecycle-2026-11-13.md](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md)

### Inferences
- Treat the original “45 YES” headline as **obsolete for this working tree**. A fair current split is: ~8 items still YES or YES-until-config/ops, ~12 original YES items that are **code-handled but production-off or production-unverified**, and the rest HANDLED here.
- **Still YES / store-blocker in this tree (do not ship this binary as-is):** #58 cold-start stuck screen; #69 push (missing `google-services.json` and no iOS `GoogleService-Info.plist`); QA bug 2 logout on non-Firebase builds; QA bug 3 dead Pay-now while SkipCash is off; QA bug 4 overdue bookings hijacking session. #38 remains a **life-safety ops YES** until an unanswered SOS is proven to page a human and give the customer a working number within minutes — code escalates, but a 5-day-old level-3 SOS was still in the inbox.
- **YES only if you turn SkipCash/membership ON at launch (code exists, not proven on production):** #77–83, #89–90, #93–94. 13 Nov launch flags have both **off**. The QA note says the launch *decision* was “card and membership live at launch”; production does not match that decision.
- **YES as config, not as missing code:** #19 (set `MIN_APP_VERSION_*` and store URLs before or with the first store binary), #27 (already true on production), #41 (`support_phone` null → app fallback `+97470919191`, unconfirmed as the real ops number), #66 (`REDIS_URL` or `SINGLE_INSTANCE=true`), #81 (`SKIPCASH_WEBHOOK_SECRET` — boot-refuses if missing in production *when the tech API starts*, but SkipCash is currently disabled).
- **Downgraded from YES if you accept the 7 Nov 24/7 staffing decision:** #37. If night coverage is actually a call-forwarding phone, the customer still is not told that before submit.
- **Local-only HANDLED, not in this tree, not in production:** QA bugs 1–5 on `fix/customer-qa-2026-11-13`. Shipping “today” from this working tree does **not** include those fixes.

### Gaps
- Whether Atlas has `uniq_active_sos_per_customer` and `uniq_sos_client_request_id` built (`autoIndex` off) — not queried.
- Whether production `ONCALL_PHONE` / ops-setting `oncall_phones` is a real 24/7 mobile. Escalation level 3 on the 8 Nov SOS could have been “alert all admins” because no on-call numbers were set.
- Live register/OTP/SMS on a real Qatar SIM was intentionally not run on 13 Nov.
- iPhone killed-app push (#69) was not device-tested.
- Double-charge, webhook-lost, membership double-checkout, and refund approval were not exercised on production because SkipCash and membership are off.
- Whether `fix/customer-qa-2026-11-13` has since been merged into this workspace after the QA note was written: `SCHEDULED_OVERDUE_GRACE_MS` is still absent here, so at least bug 4 has **not** landed in this tree.

---

## What business cases are missing: surge/high demand, no technicians, after-hours, coverage area, cancel policies, refunds, membership value, cash vs card, unpaid jobs, support contact, legal (privacy, terms, account deletion for stores)?

### Takeaway
The product handles the **happy path** (SOS → dispatch → track → cash pay → complete → rate) on production. Off-path business cases are uneven: high-demand is a **display-only** flag that is off until `SOS_BUSY_PENDING` is set; there is no “no technicians online” hard stop; after-hours is a stamp plus a 24/7 claim, not a customer warning; coverage is a box; cancel fees are threatened but not collected; refunds exist for **finance/admin**, not the customer; membership is off and SOS/towing is **never** covered even when it is on; cash is the only live tender; unpaid jobs no longer block SOS; support has a fallback number that production does not confirm; legal surfaces exist (in-app privacy, terms, delete) but iOS privacy manifests and Play/App Store data-deletion completeness are incomplete.

### Cited Findings

**Surge / high demand**
- `isHighDemand()` is off until `SOS_BUSY_PENDING > 0`. It does **not** block `createSOS`. Session exposes `high_demand`. — [sosBusy.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-shared/utils/sosBusy.js); [customerBookingGuard.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-shared/utils/customerBookingGuard.js)
- Customer timer screen has `dispatch.high_demand_title` / `high_demand_body` copy. — [timer_sos_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/home/timer_sos_screen.dart)
- No queue position, no surge price, no “we will call you in N minutes” SLA besides the 60 s timer whose `onComplete` was empty on 7 Nov (#40, “part of 38”). Escalation at 8 minutes tells the customer to call. — [sosEscalation.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-shared/services/sosEscalation.js); [CLICKS_CUSTOMER_FAILURE_SCENARIOS.md](file:///c:/Users/TS/Downloads/clicks-workspace/CLICKS_CUSTOMER_FAILURE_SCENARIOS.md)

**No technicians**
- Nearby endpoint for customers returns a count, not a “nobody is out” booking block. SOS create is coverage + flags + “one active SOS”, not “≥1 online technician”. — [nearby-technicians-access.integration.test.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/tests/integration/nearby-technicians-access.integration.test.js)
- 13 Nov lifecycle used **admin “Create job”** to assign Omar; Omar was flipped Online only for the test. There is no customer-visible “no vans available” outcome. — [qa-customer-lifecycle-2026-11-13.md](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md)

**After-hours**
- Public config claims `dispatch_hours: "24/7"`. — [configRoutes.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-customer-tech-api/src/routes/configRoutes.js)
- Hours helper still marks 02:00 Qatar as `after_hours: true`. — [qatarBusinessHours.test.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-shared/utils/qatarBusinessHours.test.js)
- Customer is not shown “out of hours, next available at …” before submit (original #37 NOT HANDLED). — [CLICKS_CUSTOMER_FAILURE_SCENARIOS.md](file:///c:/Users/TS/Downloads/clicks-workspace/CLICKS_CUSTOMER_FAILURE_SCENARIOS.md)

**Coverage area**
- Server uses `QATAR_BOUNDS` (bounding box). Public config publishes those bounds. Box includes parts of Saudi Arabia, Bahraini islands, and open water (original #32, launch blocker NO). — [qatarCoverage.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-shared/utils/qatarCoverage.js); [configRoutes.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-customer-tech-api/src/routes/configRoutes.js)
- 13 Nov: NYC pin → `400 OUTSIDE_COVERAGE`. — [qa-customer-lifecycle-2026-11-13.md](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md)

**Cancel policies**
- Status-based free vs fee vs contact-support is enforced on the cancel endpoint and exposed as `cancel_policy` on the session. Amount comes from `CUSTOMER_CANCEL_FEE_QAR` or is null. **No collection path** for a cancelled job. — [customerCancelPolicy.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-shared/utils/customerCancelPolicy.js)
- Original #64/#92: “remove it from the UI or build it”; launch blocker NO. — [CLICKS_CUSTOMER_FAILURE_SCENARIOS.md](file:///c:/Users/TS/Downloads/clicks-workspace/CLICKS_CUSTOMER_FAILURE_SCENARIOS.md)

**Refunds**
- Finance portal: list/request/approve/reject refund + credit-note PDF. Membership admin refund opens a refund case. Duplicate SkipCash capture opens a refund case + ops alert. — [financePortal.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-admin-api/src/routes/financePortal.js); [jobPayment.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-shared/services/jobPayment.js)
- Customer app has **no “request a refund”** action. Contact Us is the complaint path. Account deletion policy is `forfeit_no_refund`. — [customerController.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-customer-tech-api/src/controllers/customerController.js)
- 7 Nov legal gap: “Legal review of the membership and refund terms” was explicitly not covered. — [CLICKS_CUSTOMER_FAILURE_SCENARIOS.md](file:///c:/Users/TS/Downloads/clicks-workspace/CLICKS_CUSTOMER_FAILURE_SCENARIOS.md)

**Membership value**
- Flag `LAUNCH_CUSTOMER_MEMBERSHIP` defaults **off in production**. Checkout 404 when off. — [featureFlags.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-customer-tech-api/src/utils/featureFlags.js)
- Emergency types SOS, towing, jump start are **never covered**. Plan API now exposes `coverage.covers_emergency` / `excluded_service_types`. — [membershipEntitlement.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-shared/services/membershipEntitlement.js); [membership-checkout-quota.integration.test.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/tests/integration/membership-checkout-quota.integration.test.js)
- Customer cancel is **end of paid period**, no refund, no proration; immediate cancel of an active membership is finance-only. — [membershipController.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-customer-tech-api/src/controllers/membershipController.js)
- Production 13 Nov: membership **SKIP**. — [qa-customer-lifecycle-2026-11-13.md](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md)

**Cash vs card**
- SkipCash `enabled` is true only when key id/secret/client id are present and `SKIPCASH_ENABLED` is not explicitly false. — [skipcash.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-shared/utils/skipcash.js)
- Production 13 Nov: `flags.skipcash=false`. Cash to technician worked end-to-end (QAR 150, Omar). Pay-now still offered. — [qa-customer-lifecycle-2026-11-13.md](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md)
- Technician can still confirm `card`/`wallet`/`fawran` without a SkipCash id (fraud vector #85). — [jobController.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-customer-tech-api/src/controllers/jobController.js)

**Unpaid jobs**
- Completion requires payment (happy path). Unpaid completed jobs appear as `unpaid_job` in session; SOS is allowed; delete is blocked with `UNPAID_JOB_HOLD`. — [customerBookingGuard.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-shared/utils/customerBookingGuard.js); [customerController.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-customer-tech-api/src/controllers/customerController.js)
- 13 Nov created a real QAR 150 cash job on Omar that finance must exclude/reverse. Demo overdue bookings remain pending. — [qa-customer-lifecycle-2026-11-13.md](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md)

**Support contact**
- One client constant: `PublicConfig.supportPhone`, fallback `+97470919191` (receipt PDF number). Server `support_phone` wins when set. — [public_config.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/core/config/public_config.dart); [sos_support_contact.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/core/sos_services/sos_support_contact.dart)
- Production 13 Nov: `support_phone` is **null**. — [qa-customer-lifecycle-2026-11-13.md](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md)
- Contact Us + My Requests exist in the customer app; admin support-tickets screens exist. — [contact_us_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/settings/ui/view/contact_us_screen.dart); [support_tickets_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-admin/lib/features/phase2/support_tickets_screen.dart)

**Legal (privacy, terms, account deletion for stores)**
- In-app Privacy Policy and Terms load from `/api/content/privacy-policy` and `/api/content/terms-and-conditions`. Settings rows exist. — [settings_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/settings/ui/view/settings_screen.dart)
- Privacy v2 HTML: deletion via the app, `https://admin.clicks.qa/account-deletion`, or support; legal entity Sanad RSA / `support@sanad.qa`; package `com.roya.clicks_user`. — [privacy-policy-v2.html](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/scripts/content/privacy-policy-v2.html)
- Play-compliance script expects a public privacy URL (`https://admin.clicks.qa/privacy-policy.html`) and technician background-location disclosure (technician app, not customer). — [qa-play-store-compliance.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/scripts/qa-play-store-compliance.js)
- In-app Delete Account is present (Apple Guideline 5.1.1(v) / Play account-deletion). Deletion is **soft** (`Inactive` + `deleted_at`); PII anonymised after **30 days**. Membership forfeited, no auto refund. — [Customer.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-shared/models/Customer.js); [anonymiseDeletedCustomers.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-shared/services/anonymiseDeletedCustomers.js)
- **No** `PrivacyInfo.xcprivacy` anywhere in the workspace. Customer iOS `Info.plist` has location/camera/photos + `remote-notification`, no `NSUserTrackingUsageDescription`, no encryption export key. — [Info.plist](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/ios/Runner/Info.plist)
- **No** `GoogleService-Info.plist` in `clicks-user`. Android `google-services.json` is missing (only `.example` and 2-byte `.broken`). — glob of `clicks-user`
- Android `allowBackup=false` (addresses part of original #18). No `ACCESS_BACKGROUND_LOCATION` on the **customer** app (foreground location only). — [AndroidManifest.xml](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/android/app/src/main/AndroidManifest.xml)

### Inferences
- **Store blocker:** missing Firebase configs (no push, likely logout crash on Android); missing iOS privacy manifest for Maps/Firebase SDKs (App Store review rejection risk since Apple required third-party privacy manifests); `support_phone` null so “Call us” during an emergency is an unconfirmed fallback; unanswered SOS can sit for days after escalation.
- **Soft-launch (handful of customers, ops watching):** high-demand copy unused; no “no vans” outcome (ops creates the job by hand, as in the 13 Nov test); coverage box over-accepts border/sea pins; cancel-fee threat without collection (dispute risk); cash-only if SkipCash stays off; overdue bookings must be cleaned by dispatch.
- **Later / with membership+card on:** membership vs SOS coverage honesty in marketing; customer-initiated refunds; cancel-fee collection; surge pricing; land-polygon coverage; legal review of forfeit-on-delete and no-proration membership.
- Original #91 (block SOS when unpaid) was a **conscious policy reversal** toward “always help, show the debt”. That is the right roadside product call; it is not “missing”.

### Gaps
- Whether `+97470919191` is the real 24/7 ops number (comment says “confirm with ops before launch”).
- Whether `https://admin.clicks.qa/account-deletion` and privacy HTML are live and match the in-app policy version.
- Qatar PDPL / consumer-protection legal review of 30-day retention, membership forfeit, and cash-only receipts — not in repo.
- App Store Connect / Play Console Data safety form contents — not in repo.
- Whether customer Info.plist `ITSAppUsesNonExemptEncryption` is set in Xcode project (not in the plist file).

---

## What production config is incomplete: support_phone null, min_app_version null, google-services.json missing, SkipCash off, membership off?

### Takeaway
Yes — all five named items are incomplete **on production or in this tree**, plus several related boot/ops knobs. Public SOS is the one launch flag that 13 Nov confirmed **on**. Card and membership being off is a product decision mismatch, not a missing feature flag. Missing `google-services.json` / `GoogleService-Info.plist` is a **store binary** problem, not a Railway env problem.

### Cited Findings
- 13 Nov production `/api/config/public` (via QA): `support_phone` null; `min_app_version` and `store_url` null both platforms; `publicSos=true`; `customerMembership=false`; `skipcash=false`. App falls back to built-in `+97470919191`. — [qa-customer-lifecycle-2026-11-13.md](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md)
- Boot guard: production tech API **refuses to start** if `LAUNCH_PUBLIC_SOS` unset, `SKIPCASH_WEBHOOK_SECRET` empty, `SMS_PROVIDER` console/unset, or neither `REDIS_URL` nor `SINGLE_INSTANCE=true`. `SUPPORT_PHONE` unset is a **warning** only. `MIN_APP_VERSION_*` are listed in FLAG_NAMES for logging but **not** required to boot. — [assertProductionConfig.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-shared/utils/assertProductionConfig.js)
- `LAUNCH_*` defaults are permissive off-production and **off in production when unset**. `skipcash` follows keys, not `LAUNCH_SKIPCASH`. — [featureFlags.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-customer-tech-api/src/utils/featureFlags.js); [skipcash.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-shared/utils/skipcash.js)
- `clicks-user/android/app/google-services.json` missing; only `.example` and `.broken` (2-byte file). 13 Nov: FCM “not testable”; logout hang “very likely” on Android without that file. — glob `clicks-user`; [qa-customer-lifecycle-2026-11-13.md](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md); [google-services.json.broken](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/android/app/google-services.json.broken)
- No `GoogleService-Info.plist` in `clicks-user`. iOS `Info.plist` does declare `remote-notification`. — [Info.plist](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/ios/Runner/Info.plist)
- Ops settings: `support_phone` and `oncall_phones` can be set in admin (overrides env). Production values were null/unconfirmed on 13 Nov. — [opsSettings.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-shared/services/opsSettings.js)
- `CUSTOMER_CANCEL_FEE_QAR` optional; `SOS_BUSY_PENDING` default 0 (high-demand off); `SOS_ESCALATE_*` defaults 2/5/8 minutes. — [customerCancelPolicy.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-shared/utils/customerCancelPolicy.js); [sosBusy.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-shared/utils/sosBusy.js); [sosEscalation.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-shared/services/sosEscalation.js)
- 7 Nov config checklist still relevant: `LAUNCH_PUBLIC_SOS=true` (done), `SKIPCASH_WEBHOOK_SECRET`, `SMS_PROVIDER=smsala`, replicas=1 or Redis, `CORS_ORIGINS`, `SENTRY_DSN`, Maps key restricted, Notification TTL index, one support phone test-called. — [CLICKS_CUSTOMER_FAILURE_SCENARIOS.md](file:///c:/Users/TS/Downloads/clicks-workspace/CLICKS_CUSTOMER_FAILURE_SCENARIOS.md)
- August 2026 audit claimed `google-services.json` **was committed**; current tree is the opposite. That audit is stale on this point. — [CLICKS_PRODUCTION_READINESS_AUDIT.md](file:///c:/Users/TS/Downloads/clicks-workspace/CLICKS_PRODUCTION_READINESS_AUDIT.md) P1-4 vs current glob

### Inferences
- A store binary built from **this tree** cannot offer working FCM on Android and likely cannot initialise Firebase at all → logout/settings crash path (bug 2) and no job-status pushes.
- Forced update cannot be used after a breaking API change until Railway `MIN_APP_VERSION_*` and store URLs are set. The **screen** is in the first binary; the **numbers** are not.
- Shipping cash-only is operationally coherent **if** Pay-now is hidden (QA branch) and marketing does not promise card. Shipping this tree with SkipCash off leaves a dead Pay-now button (medium–high, 13 Nov).
- Membership off means no “roadside membership” store screenshots should show paid plans.

### Gaps
- Actual Railway env dump (`LAUNCH_*`, `SKIPCASH_*`, `SMS_PROVIDER`, `SINGLE_INSTANCE`, `SENTRY_DSN`, `ONCALL_PHONE`) was not read in this pass; values are inferred from the 13 Nov public-config probe and QA notes.
- Whether production tech API is pinned to one replica.
- Whether Maps API keys are iOS/Android-restricted.

---

## What money/legal risk exists if you ship today?

### Takeaway
Shipping **this working tree, against current production flags, as a public store app** mainly risks: (1) emergency customers stuck on a completed-job screen or a days-old unanswered SOS; (2) store-review rejection (privacy manifest, Firebase, account-deletion data not actually erased for 30 days); (3) cash-handling and fee-threat disputes; (4) a QA cash job already on the books. Card/membership double-charge risk is **latent** (code has a reconciler and refund cases) until those flags go on; enabling them without a production webhook test re-opens the original money YES list. Legal copy exists but has not had the legal review the 7 Nov audit said was out of scope.

### Cited Findings

**Money — live with cash-only production**
- 13 Nov QA job `6af6fea823056263b0d66d9d` is recorded paid cash QAR 150 by Omar, reference `QA-LIFECYCLE`. “Not reversible by me: Finance should exclude or reverse it.” — [qa-customer-lifecycle-2026-11-13.md](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md)
- Technician `confirmPayment` still allows `card`/`wallet`/`fawran` without a provider id, which zeros the cash the technician owes (#85). — [jobController.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-customer-tech-api/src/controllers/jobController.js); [CLICKS_CUSTOMER_FAILURE_SCENARIOS.md](file:///c:/Users/TS/Downloads/clicks-workspace/CLICKS_CUSTOMER_FAILURE_SCENARIOS.md)
- Cancel “fee may apply” with `cancel_fee_due` boolean and optional `CUSTOMER_CANCEL_FEE_QAR`; **no charge is taken**. Customer can reasonably claim unfair contract terms if a fee is threatened and then demanded offline. — [customerCancelPolicy.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-shared/utils/customerCancelPolicy.js)
- Unpaid completed jobs no longer block SOS; debt is shown. Collection depends on dispatch, not the app. — [customerBookingGuard.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-shared/utils/customerBookingGuard.js)
- Quote approval before work is still missing (#87, PRE-SCALE). Technician can set price up to the server cap without customer tap. Chargebacks/cash disputes then have weak evidence. — [CLICKS_CUSTOMER_FAILURE_SCENARIOS.md](file:///c:/Users/TS/Downloads/clicks-workspace/CLICKS_CUSTOMER_FAILURE_SCENARIOS.md)

**Money — if SkipCash or membership is turned on without a new production test**
- Code now records every SkipCash payment id, locks checkout, refunds duplicate captures, sweeps pending attempts every 5 minutes, and has finance approve/reject. That is a material improvement on 7 Nov. — [paymentReconciler.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-shared/services/paymentReconciler.js); [jobPayment.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-shared/services/jobPayment.js)
- Those paths were **not** run on production on 13 Nov (`skipcash=false`). Webhook secret correctness is a boot error if missing, but SkipCash disabled means no live signed webhook was proven. — [qa-customer-lifecycle-2026-11-13.md](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md); [assertProductionConfig.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-shared/utils/assertProductionConfig.js)
- Membership: SOS/towing not covered; delete forfeits remaining term; cancel is period-end. Selling “roadside membership” in store screenshots while `covers_emergency` is false is a marketing/consumer-protection risk (#97). — [membershipEntitlement.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-shared/services/membershipEntitlement.js)

**Legal / store policy**
- Apple requires in-app account deletion (5.1.1(v)); the button exists. Apple and Play also expect deletion to actually remove account data. Clicks keeps full PII until a 30-day anonymiser. Privacy policy discloses in-app deletion but does **not** state the 30-day delay in the excerpt reviewed. — [privacy-policy-v2.html](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/scripts/content/privacy-policy-v2.html); [anonymiseDeletedCustomers.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-shared/services/anonymiseDeletedCustomers.js)
- Apple third-party SDK privacy manifests: **none** in `clicks-user` (Google Maps, Firebase, Flutter plugins). High App Store reject risk.
- Play: missing `google-services.json` is a **build** blocker for a release with FCM; Data safety form must match location/camera/photos/notifications. Customer manifest has those permissions. — [AndroidManifest.xml](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/android/app/src/main/AndroidManifest.xml)
- Support/legal contact in privacy policy is `support@sanad.qa` / Sanad RSA, while the app brand is Clicks — entity mismatch for store listings if the developer account name differs. — [privacy-policy-v2.html](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/scripts/content/privacy-policy-v2.html)
- 7 Nov: “Store-review requirements beyond account deletion” and “Legal review of the membership and refund terms” were **not covered**. — [CLICKS_CUSTOMER_FAILURE_SCENARIOS.md](file:///c:/Users/TS/Downloads/clicks-workspace/CLICKS_CUSTOMER_FAILURE_SCENARIOS.md)
- August audit P0: no alerting on SOS; health check too shallow. Escalation sweeper and Sentry warning now exist in code; 13 Nov still showed a 5-day SOS in the inbox and `SENTRY_DSN` unset is only a boot **warning**. Life-safety “would anyone know at 02:00” is only as good as `oncall_phones`. — [CLICKS_PRODUCTION_READINESS_AUDIT.md](file:///c:/Users/TS/Downloads/clicks-workspace/CLICKS_PRODUCTION_READINESS_AUDIT.md); [assertProductionConfig.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-shared/utils/assertProductionConfig.js); [qa-customer-lifecycle-2026-11-13.md](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md)

**Life-safety / brand (money follows)**
- Unanswered SOS never auto-expires; it blocks that customer from a new SOS (`can_book_sos: !activeSos`). A competitor call or police call is the 7 Nov “worst failure for a roadside brand”. — [customerBookingGuard.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-shared/utils/customerBookingGuard.js); [sosSocketService.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-customer-tech-api/src/services/sosSocketService.js)
- Cold-start stuck in-progress after the job is paid: customer cannot rate or leave the screen without luck/resume. Store reviews will describe “app froze after I paid”. Fixed only on an unpushed branch. — [qa-customer-lifecycle-2026-11-13.md](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md)

### Inferences
- **Do not public-store-ship this working tree today.** Soft-launch to a watched cohort *after* merging the 13 Nov QA branch (bugs 1–5), restoring Firebase configs, setting `SUPPORT_PHONE` / `ONCALL_PHONE` / `MIN_APP_VERSION_*`, hiding or enabling Pay-now consistently, and ops-clearing the stale SOS + overdue demo bookings — that is a coherent **soft-launch** bar, not a store-marketing bar.
- **Largest money leak if card stays off:** technician cash-vs-card fraud (#85) and uncollected cancel fees, not SkipCash double capture.
- **Largest money leak if card is turned on without a signed webhook + 5-minute sweep check on production:** the original #78–82 class (paid but unpaid in Clicks, or double capture). Code is better; production proof is missing.
- **Largest legal/store risk:** privacy manifest + Firebase packaging + 30-day-not-immediate deletion vs what the privacy policy and store questionnaires say; Sanad vs Clicks naming; membership marketing vs SOS exclusion.

### Gaps
- No lawyer/compliance review in-repo of PDPL, Apple 5.1.1, Play Data safety, or membership terms.
- No production SkipCash settlement vs Clicks receipts reconciliation report was found for 13 Nov.
- Whether Omar’s QAR 150 QA cash job was reversed after the note was written is unknown.
- Crashlytics/Sentry DSN presence in the customer store build was not verified (August audit said Crashlytics was not initialised; may have changed).
