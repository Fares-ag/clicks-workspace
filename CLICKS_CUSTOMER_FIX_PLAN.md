# Clicks Customer App: Fix Implementation Plan

**Date:** 7 November 2026
**Source:** `CLICKS_CUSTOMER_FAILURE_SCENARIOS.md`. Scenario numbers below refer to that file, and "S-tech" means the nearby-technicians exposure listed after scenario 100.

**Decisions this plan rests on:**

| Decision | Choice | Effect on the plan |
|---|---|---|
| Launch scope | Card payments (SkipCash) **and** memberships live on day one | All money and membership blockers are in the launch phase |
| Unpaid balance + new SOS (S91) | **Allow the SOS and show the balance** | The guard changes; dispatch sees the outstanding amount |
| Dispatch hours | **24/7 staffed** | S37's after-hours messaging is dropped. The escalation ladder pages an on-call manager instead |
| Delivery | **Commit the current tree as a baseline, then one branch and PR per workstream** | Every fix can be reviewed and reverted |

**Assumption to confirm:** the customer app is not yet in the public stores, so only tester builds exist. If public builds exist, see section 4 on backward compatibility.

---

## 1. Shape of the work

The scenarios come from **eight underlying defects**. Fixing a defect once in a shared service is cheaper than patching each scenario.

| Root defect | Shared fix | Scenarios it closes |
|---|---|---|
| Linked state changes are a read followed by a separate write | Conditional updates and transactions in **one shared service per transition** (cancel, complete, link SOS→Job) | 29, 42, 43, 44, 48, 50, 51, 54, 57, 80, 90, 98 |
| Payment attempts overwrite each other | A **`PaymentAttempt` ledger**, plus a reconciliation sweep | 78, 79, 80, 82, 84, 94 |
| Notifications are scattered across many code paths | **One `notifyCustomer()`** that writes the inbox, emits on the socket and pushes | 46, 49, 52, 71, 73, 74, 76 |
| The app trusts the socket and never re-syncs | **Re-fetch the session on reconnect and resume**, and filter events by id | 30, 58, 62, 65, 67 |
| Nothing watches the clock | A **sweeper** for SOS escalation and payment reconciliation | 38, 39, 40, 82 |
| Production config is assumed, not checked | **Boot-time assertions**, plus a `/config/public` endpoint | 9, 19, 27, 41, 66, 81 |
| Some records never reach a final state | Terminal-state writes in the shared services, plus backfills | 3, 54, 55 |
| Identity matches on fuzzy keys | Exact E.164 matching, OTP sent to the stored number, per-phone caps | 6, 7, 11 |

**Estimated effort:** about 35 engineer-days for the launch phase. With two engineers that is about 4 calendar weeks including device testing. These are planning estimates, not commitments.

---

## 2. Phase 0: Baseline (half a day)

1. **Baseline commit on `main`.** Commit the current working tree as it is: about 239 changed files, three rounds of audit fixes that currently exist only on this laptop.
   - `SECRETS.TRANSFER.md` is already gitignored (`.gitignore:51`). Leave it out.
   - **Leave out** `clicks-user/android/app/google-services.json.broken`. It is untracked and holds Firebase config.
   - Tag the commit `baseline-2026-11-07`.
2. **Push and let CI run once** (`.github/workflows/ci.yml`). Record which tests fail. Those failures are the starting point, not something these fixes caused.
3. **Branching:**
   - Name branches `fix/<workstream>`, for example `fix/ws-d-payments`.
   - One PR per workstream, split further if a PR goes over about 800 lines.
   - CI must be green before merge.
   - Each PR description lists the scenario numbers it closes.
4. **Definition of done for every PR:**
   - An integration test in `clicks-api/tests/integration/`, using the existing jest + `MongoMemoryReplSet` harness, that reproduces the scenario before the fix and passes after it.
   - A migration or backfill script with a `--dry-run` mode, where data is affected.
   - The scenario marked ✅ in `CLICKS_CUSTOMER_FAILURE_SCENARIOS.md`.
   - Where Flutter is touched, a note for the release-train changelog (section 4).

---

## 3. Workstreams

Effort is in engineer-days. **Owner rule:** `API/controllers/jobController.js` is touched by WS-A, WS-B and WS-D. Merge WS-D's completion-service extraction **first**, and have the others rebase onto it.

### QW: Quick wins (1.5 days, branch `fix/quick-wins`, merge first)

These are small, independent changes, each closing a blocker:

| # | Change | File |
|---|---|---|
| 1 | The app sends `otp` in the register body | `APP/features/auth/register/ui/cubit/register_cubit.dart:220-229` |
| 3 | Add `deleted_at` and `deleted_reason` to the Customer schema | `SH/models/Customer.js` |
| 24 | Whitelist the editable vehicle fields: make, model, year, colour, plate, nickname | `API/controllers/vehicleController.js:117` |
| 41 | One support number constant, later served by `/config/public` (WS-I) | `APP` tracking, activity, session_resume and timer_sos screens |
| 70 | Clear the FCM token only if it is still the failed one: `updateOne({_id, fcm_token: failed}, {$unset})` | `API/services/fcmService.js:178-186, 258-263` |
| 99 | Call `.toLocal()` on every parsed server date (grep `DateTime.tryParse` / `DateTime.parse` in `APP`) | `job_history_response.dart:161` and the others found |
| 67 | Treat non-2xx as an error in `getCustomerSession` and the splash screen; show a retry state instead of routing Home | `customer_socket_service.dart:282-288`, `splash_screen.dart:53-87` |
| S-tech | Remove customer access to `/technicians/nearby`, or return only a count and distance | `API/routes/jobRoutes.js:87` |
| 2, 8 | Return 409 on E11000; lower-case and trim email | `API/controllers/customerController.js:29,49,89-91,223-233` |
| 5 | Show the deletion error reason and a Pay-now link | `settings_cubit.dart:20-27`, `settings_screen.dart:39-44` |
| 28 | Mount `requirePublicSos` on immediate service requests | `API/routes/serviceRequestRoutes.js` |

**Tests:** `otp.integration.test.js` gets a test that registration with the OTP succeeds. New tests: `vehicle-update-whitelist`, `nearby-technicians-access`.

### WS-I: Production configuration and ops guards (1 day, merge early)

**Closes:** 9 (config part), 19 (server part), 27, 41, 66, 81, plus CORS, Sentry and the notification TTL.

1. Add `SH/utils/assertProductionConfig.js`, called from both `index.js` files. When `NODE_ENV=production`, **refuse to start** if any of these hold:
   - `LAUNCH_PUBLIC_SOS` is not set explicitly
   - `SKIPCASH_WEBHOOK_SECRET` is empty
   - `SMS_PROVIDER` is `console` or unset
   - `CORS_ORIGINS` is empty
   - neither `REDIS_URL` nor `SINGLE_INSTANCE=true` is set

   Warn, but still start, if `SENTRY_DSN` is unset. Log every feature flag's value at boot.
2. Add a `GET /api/config/public` endpoint returning feature flags, `min_app_version` (iOS and Android), `support_phone` and `coverage` metadata. The app reads it at splash (WS-F, item 19).
3. Add `scripts/sync-indexes.js`. Production runs with `autoIndex: false`, so this script builds:
   - the Notification TTL index (S26)
   - every new unique index from this plan

   It runs as a release step, with a dry-run listing.
4. Railway: pin the tech API to 1 replica, disable deploy overlap in the service settings, and set `SINGLE_INSTANCE=true`. Moving to the Redis adapter can wait until after launch.
5. Alert: send a Sentry event on any SkipCash webhook 401 and on an outbox event moving to `failed`.

**Tests:** a unit test that the config assertion fails for each missing variable.

### WS-F: Identity and account (4 days)

**Closes:** 1, 3, 4, 6, 7, 9, 11, 12, 13, 14, 17, 18, 19, 20.

1. **Phone matching (6, 7):**
   - In `SH/utils/phone.js`, only add the last-8-digit and `+974` variants when the input is 8 digits or starts with `974` or `+974`.
   - `forgotPassword` and `resetPassword` look up the customer first, then send and verify the OTP against **`customer.phone_number`**, never against the raw input.
   - Add `scripts/dedupe-customer-phones.js`: a dry-run report of collisions, then a merge or flag. After it runs, add a unique index on the normalised number (via `sync-indexes`).
2. **OTP sending (9, 11):**
   - Cap sends per phone at 3 per hour and 10 per day, reusing the technician pattern from `technicianController.js:879-891`.
   - Allow only `+974` numbers at launch, set by env `OTP_ALLOWED_PREFIXES=+974`.
   - Parse the SMSala response body for errors and treat an error as a failure.
   - Add a daily SMS count metric with a Sentry alert above a threshold.
3. **Sessions (12, 13):**
   - Add `token_version` to Customer and put it in the JWT. `authenticate` checks it.
   - Bump `token_version` on password reset, password change and "log out everywhere".
   - Add a sliding refresh: `POST /api/customers/token/refresh`, which accepts a valid token with less than 3 days left. The app refreshes on launch and resume when it is close to expiry.
   - On 401 while the cached session shows a live SOS or job, try one refresh. If that fails, go to login and return to the job afterwards instead of Home.
   - The socket uses callback-style `auth` so a reconnect picks up the new token.
4. **Blocked accounts (14):**
   - The app handles `403 ACCOUNT_INACTIVE` with a "contact support" screen and disconnects the socket.
   - The admin block action calls the internal notify endpoint to `disconnectSockets` for the `user:<id>` room.
   - The socket handshake checks `status`.
5. **Deletion (3, 4):**
   - Block deletion while there is a live SOS, a live job or an active booking (409 with a code the app maps).
   - Warn about an active membership. The membership is forfeited with no refund unless finance decides otherwise; put that policy in the copy.
   - Send the deletion reason from the app.
   - A daily job anonymises personal data 30 days after `deleted_at`: name, email and phone are replaced with tombstones; jobs and receipts are kept for accounting.
   - Re-registering the same phone after anonymisation creates a fresh account. Before anonymisation, it offers "restore account" via OTP.
6. **Forced update (19):**
   - The app sends `X-App-Version` and `X-Platform` on every request.
   - Splash compares against `/config/public.min_app_version` and shows a blocking update screen.
   - **This must be in the first store build.**
7. **Language (20):**
   - Every server error carries a stable `code`.
   - Extend `APP/core/helper/booking_errors.dart` into one shared `errorMessageForCode()` with en and ar entries.
   - Replace the hardcoded English in `sos_cubit.dart:345,367,388`, `skipcash_api.dart:49,54` and `forget_password_cubit.dart`.
   - Never show a raw server `error` string.
8. **Storage (18):**
   - Wrap `CacheHelper.init` in try/catch and reset on failure.
   - On first run, wipe secure storage, using a flag kept in plain SharedPreferences.
   - Set Android `allowBackup="false"`.
9. **Name validation (17):** one rule for client and server: first and last name 1–50 characters, letters including Arabic, spaces, `'` and `-`.

**Tests:**
- `otp.integration.test.js`: a foreign-suffix reset is refused; the per-phone cap returns 429.
- New: `customer-token-version`, `customer-deletion-guards`, `account-inactive-socket`.

### WS-A: SOS and dispatch integrity (5 days, after WS-D's completion service lands)

**Closes:** 29, 30, 31, 34, 36, 38, 39, 40, 42, 43, 44, 45, 48, 50, 51, 91.

1. **One active SOS per customer (29):**
   - Add a unique partial index on `SOSRequest {customer_id}` where `status ∈ {pending, in_call}`.
   - `createSOS` catches E11000 and returns the existing SOS.
   - The app sends `client_request_id`; the server stores it and treats a repeat as the same request.
2. **Creation handshake (30):**
   - `createSOS` uses a socket acknowledgement callback, and also sends `sosCreated` with `emitToUser`.
   - The app waits 10 seconds for the ack. On timeout or `SOS_ALREADY_ACTIVE`, it fetches `/customer/session` and opens the timer screen for that SOS.
3. **Atomic SOS→Job link (42, 43, 44):** a new `SH/services/linkSosToJob.js` used by `createJobRecord`. Inside `mongoTransactions`:
   - first `SOSRequest.findOneAndUpdate({_id, status:"in_call", job_id:null, claimed_by: adminId}, {status:"accepted", job_id: newId})`, then insert the Job with `_id = newId`;
   - a CAS miss returns 409 "already handled";
   - the fallback when the replica set is unavailable is the same order, with a compensating revert if the insert fails;
   - `cancelSOS` and `sosOutcomes` (`SH/services/sosOutcomes.js:19-59`) switch to conditional updates;
   - a nightly `scripts/check-sos-job-consistency.js` reports any SOS whose state disagrees with its job's.
4. **Pending jobs visible (45):**
   - `findLiveJob` includes `pending`.
   - The app shows "Finding a technician" for a pending job, with a cancel option (free).
5. **Technician cancel re-dispatches (48):** `cancelJobByTechnician` calls the existing `SH/services/jobReassign.js` path. The job goes back to `pending` with no technician, the SOS stays linked, admins get an alert, and the customer gets a "Finding another technician" event.
6. **One cancel service (50, 51):** `SH/services/cancelJob.js` is shared by the customer, technician and admin paths. It does:
   - a conditional update;
   - the SOS outcome;
   - the ServiceRequest terminal state (WS-G);
   - `notifyCustomer` and the technician notification (WS-C);
   - **for a paid job, a refund decision**: `refund: full | partial | none` with a reason, which creates a Refund (WS-D).

   Also:
   - Add `POST /api/jobs/:id/cancel` to `ADM/routes/jobs.js`, matching what the admin app already calls.
   - `PUT /jobs/:id` rejects `job_status ∈ {cancelled, completed}` and points to the dedicated endpoints.
   - `deleteJob` becomes a soft delete and is refused for paid jobs.
7. **Escalation ladder (38, 39, 40):** with 24/7 dispatch, there is no customer-facing after-hours logic.
   - Add `escalation_level` and `last_escalated_at` to SOSRequest.
   - Add a sweeper (`SH/services/sosEscalation.js`) that runs every 30 seconds from the tech API. It is `unref`'d, stopped on SIGTERM, and protected by a lease (an `ops_leases` document) so a second instance can't double-fire. Steps:
     - after 2 minutes pending: re-push all dispatchers and send an admin socket alert;
     - after 5 minutes: SMS the on-call manager (`ONCALL_PHONE`);
     - after 8 minutes: send the customer the "still connecting you, tap to call" event with the support number.
   - A claim with no job after 5 minutes is released back to `pending`, re-alerts, and is audit-logged. Supervisors get a "take over" action.
   - Every step is a conditional update on `escalation_level`, so a restart can't double-send.
   - The admin SOS screen shows the age and the escalation level.
   - `timer_sos_screen.dart` `onComplete` shows the call card.
8. **Location (31, 34):**
   - The app rejects fixes older than 2 minutes or less accurate than 200 m.
   - A confirm-location sheet with a draggable pin appears before submit.
   - The app sends `accuracy_m` and `fix_time`.
   - `createJobRecord` copies the SOS coordinates by default; admin text becomes a label only.
9. **Unpaid balance (91, by decision):**
   - `customerBookingGuard` stops blocking the SOS on `UNPAID_JOB_HOLD`. Scheduled bookings stay blocked.
   - The SOS stores `outstanding_balance` and `outstanding_job_ids`.
   - The admin SOS card shows them, and the app shows a banner: "You have QAR X outstanding; the technician can collect it."
10. **Throttle (36):** at most 3 SOS creates per customer per 10 minutes.

**Tests:**
- `sos-e2e`: a duplicate create returns the same id; an ack timeout recovers.
- New:
  - `sos-link-race`: two parallel creates → one job.
  - `sos-cancel-vs-create`: the race resolves to one consistent state.
  - `technician-cancel-redispatch`
  - `admin-cancel-paid-requires-refund`
  - `sos-escalation`: fake timers, lease, no double-send.

### WS-G: Scheduled bookings (1.5 days, in parallel with WS-A, reusing its services)

**Closes:** 53, 54, 55, 56, 57.

1. The shared `completeJob` (WS-D) and `cancelJob` (WS-A) services set the linked ServiceRequest to `completed` or `cancelled`.
2. `scripts/backfill-service-request-status.js` (dry run first) fixes existing `assigned` rows whose job has finished.
3. `findActiveServiceRequest` stops counting finished jobs. A scheduled booking counts as an "active session" only from 60 minutes before its slot. Otherwise Home shows an "Upcoming booking" card and Activity lists it.
4. A `client_request_id` idempotency key on service requests, plus a dedupe window (same customer, vehicle and slot within 2 minutes returns the existing request).
5. Free customer cancel on `pending` jobs. For `on_hold`, the message becomes "contact support".
6. Allow future bookings on a vehicle that has no live job (56).

**Tests:** extend `customer-booking-rules.integration.test.js`. New: `service-request-terminal`.

### WS-D: Payments integrity (7 days, starts in week 1 and owns `jobController.js` completion first)

**Closes:** 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 89, 90, 98.

1. **One completion service (89, 90, 98).** Extract `SH/services/completeJob.js` from `runCompletionWithTransaction` / `runCompletionMoneyPath` (`API/controllers/jobController.js:351-458`).
   - It is used by the technician's `markCompleted`, the admin `completeJob` (`ADM/controllers/jobController.js:1077`), and nothing else, since `PUT` no longer completes.
   - A job with nothing to pay is marked `paid` with `payment_method: "membership"` (or `"waived"`), and the cash collected is 0.
   - `technicianCredit.collectedCashForJob` treats a total of 0 as valid and gives no `job.price` fallback for membership or waived jobs.
   - Membership consumption, the receipt and partner accrual all run inside it, with partner accrual through the outbox.
2. **`PaymentAttempt` ledger (79, 84).** A new model in `SH/models/PaymentAttempt.js`:

   | Field | Notes |
   |---|---|
   | `kind` | `job` or `membership` |
   | `job_id` / `subscription_id` | what was paid for |
   | `provider` | `skipcash` |
   | `provider_payment_id` | **unique** |
   | `amount`, `currency` | |
   | `status` | `pending`, `paid`, `failed`, `cancelled`, `refunded` |
   | `pay_url` | |
   | `events[]` | each webhook or poll result, with a timestamp |
   | `outcome` | `applied`, `duplicate_capture`, `amount_mismatch`, `refunded` |

   Every `createPayment`, webhook and `getStatus` call writes to it, and a webhook never overwrites an attempt's state with a lower one.
3. **Checkout locking and the frozen price (77, 78, 79):**
   - `createSession` takes a per-job lock with a conditional set of `payment_lock_until`, and **reuses** the newest pending attempt when the amount matches.
   - When a pending attempt exists, `job.price_locked = true`. `addRepairProcedure` and price edits return 409 `PRICE_LOCKED` until the technician cancels the attempt; cancelling first does a live `getPayment` and, if it's paid, settles it.
   - Session and job payloads carry `pricing {base, repairs[], discount, total}`. **The app shows `pricing.total` to 2 decimals everywhere** (`session_resume.dart`, `job_in_progress_screen.dart`, `payment_hold_screen.dart`) and passes it to checkout as the summary amount.
4. **How a paid webhook is applied (78, 79):** the attempt is looked up by `provider_payment_id`, which covers any attempt ever issued for the job.
   - Job unpaid, amount equals the attempt's amount → apply.
   - Job already paid → `duplicate_capture` → a refund case and an admin alert. Return 200, so SkipCash stops retrying.
   - Attempt amount differs from today's total → still apply, flagged `amount_mismatch` for finance review. **Never 409.**
5. **Technician confirmation (80, 85):**
   - `confirmPayment` lets the technician confirm **cash only**.
   - It is refused while a pending attempt exists, unless a live check shows that attempt is not paid; if it is paid, the card payment is settled instead.
   - It uses a conditional update.
   - Card, wallet and Fawran are confirmed only by the provider or by finance with a reference number. Add `POST /api/finance/jobs/:id/mark-paid`: finance role, reference required, audited.
6. **Reconciliation sweep (82):**
   - Every 5 minutes, on the same lease mechanism as WS-A, call `getPayment` for every pending attempt younger than 48 hours and apply the result.
   - Give the technician app a "re-check card payment" button that calls a technician-allowed status endpoint.
   - Add a daily report of attempts still `pending` after 48 hours.
7. **Refunds (83):**
   - Add `refunded` and `partially_refunded` to `Job.payment_status`.
   - Add a `Refund` model: `job_id`, `attempt_id`, `amount`, `reason`, `requested_by`, `approved_by`, `provider_refund_id` or `manual_reference`, `status`.
   - Add an admin/finance endpoint with a two-role approval and an audit row.
   - **Open item:** check whether the SkipCash API supports refunds. If it does, call it. If not, the refund is done in the SkipCash portal and its reference is recorded.
   - The receipt gets a credit-note PDF.
   - A refund webhook (StatusId 6) creates or confirms a Refund record.
8. **Line items (86):**
   - Require price > 0 and quantity ≥ 1 at the model and the controller.
   - Lock repairs once the job is paid or completed.
   - The receipt **snapshots** its line items when it is issued.
9. **Receipts (98):**
   - Use an atomic counter collection for numbering: `REC-2026-000001`.
   - Store `payment_method`, `provider_payment_id` and `transaction_id` on the receipt.
   - Existing receipts keep their numbers.
10. **Finance and outbox (98):**
    - Finance pending totals use `computeFinancePreview` (`ADM/controllers/financeOverviewController.js:73-121`).
    - Add an admin "Failed outbox events" list with a **Replay** button.
11. **Webhook secret (81):** covered by WS-I. Also send a SkipCash test webhook to staging during the release checklist.

**Tests:** extend `skipcash.integration.test.js` and `earnings-idempotency`. New:
- `payment-double-session`: two sessions, both paid → one applied, one `duplicate_capture`.
- `payment-stale-link`
- `confirm-cash-blocked-by-pending-card`
- `reconcile-sweep`
- `refund-flow`
- `complete-zero-due-member`, run for both the technician and admin paths
- `receipt-numbering-sequential`

### WS-E: Membership (2.5 days, after WS-D items 2 and 4)

**Closes:** 93, 94, 95, 96, 97.

1. **Idempotent checkout (93, 94):**
   - Stop cancelling `pending_payment` subscriptions in `membershipController.js:196-202`.
   - Instead, reuse the pending subscription and its attempt for the same vehicle and SKU, under a per-vehicle lock.
2. **Activation (93, 94):** `activateSubscription` activates any **paid** subscription, even if it is `cancelled`, as long as the vehicle has no other active subscription. Otherwise the subscription is `paid_duplicate`, a refund case is opened, and the customer is told.
3. **Status the app can trust (93):**
   - `getStatus` returns `subscription_status`.
   - `membership_api.dart:103-108`'s `isPaid` becomes `subscription_status == "active"`.
   - A `paid_duplicate` shows "payment received, we're refunding you".
4. **Atomic quota (95):**
   - Reserve at job creation: `findOneAndUpdate({_id, used + reserved < quota}, {$inc: {reserved: 1}})`.
   - Release on cancel; convert the reservation to used on completion (inside `completeJob`).
   - If there is no quota left, the job isn't covered, and the customer sees that before confirming.
5. **Cancellation (96):** cancel at period end by default, with on-screen terms and an audit row. Immediate cancellation is finance-only.
6. **Period arithmetic and copy (97):**
   - Compute `addMonths` in Qatar time, clamping to the end of the month (31 Jan → 28/29 Feb).
   - Add "What's covered" to the plan screen and next to the SOS button for members.
   - **Product confirmation needed:** emergency types are not covered.

**Tests:** extend `membership.integration.test.js` with double checkout, pay-the-first-link, quota race, and period-end cancel.

### WS-C: Notifications (3 days, after WS-A and WS-D define their events)

**Closes:** 46, 49, 52, 69, 71, 72, 73, 74, 76, plus 68.

1. **Push format (69, 73):** the customer push in `fcmService.js:245-251` becomes:
   - a `notification` block with title and body;
   - an `apns` block with alert, sound and `content-available: 1`, and a `thread-id` per job;
   - an Android notification with the channel id and a `tag` per job, so a job's tray entries replace each other;
   - the data block, as before.

   The app stops showing its own local banner when a system notification already exists in the background. In the foreground, it shows the banner only if the current screen isn't that job.
2. **One customer notifier (49, 52, 73, 74, 76).** Add `SH/services/notifyCustomer.js`. It writes the inbox row (awaited, not fire-and-forget), then `emitToUser`, then pushes. Every state transition calls it:
   - assigned, reassigning, en route, arrived, started
   - on hold, resumed
   - at garage, garage ready
   - completed (including by admin)
   - cancelled (any path)
   - payment confirmed
   - SOS in call, scheduled, closed, escalated

   Remove the scattered direct emits, so the socket path and the REST path behave the same.
3. **Cross-API notifies (68):** the admin API's `notify-*` calls go through the outbox with a 5-second timeout and retries.
4. **Duplicate payment push (71):** the socket `paymentReceived` idempotent branch stops notifying. Every amount comes from `pricing.total`.
5. **Notification taps (72):**
   - Handle `getNotificationAppLaunchDetails` for taps that cold-start the app.
   - The router fetches the job by its `job_id` and routes by its current status. A `sosInCall` tap checks the SOS status first.
   - Tapping an inbox row opens the job too.
6. **Rating (76):**
   - On resume, if a job is paid and unrated, prompt once and record `rating_prompted_at`.
   - The server accepts one rating per job, editable for 24 hours, and only for paid jobs.

**Tests:** `notify-customer` (inbox written before push, one call per transition) and `fcm-payload-shape` (the `apns` and `notification` blocks exist). **Device:** must-test #3 on a real iPhone.

### WS-B: Customer app session and realtime (4 days, Flutter-heavy, after WS-A, WS-C and WS-D server events exist)

**Closes:** 12 (app side), 30 (app side), 46, 47, 49, 58, 59, 61, 62, 63, 65.

1. **Re-sync (58, 65):** on socket reconnect **and** app resume, fetch `/customer/session`. If the state differs from the screen being shown, route through `SessionResume`. The tracking poll reads `job_status` as well as the location.
2. **Filter events by id (62):** every listener in the timer, in-call, tracking and job-in-progress screens and in `sos_cubit` ignores events whose `job_id` or `sos_id` doesn't match the screen's own id.
3. **New listeners (46, 47, 49):**
   - `jobReassigning` → "Finding another technician"
   - `technicianAssigned` → reload the job and reset the phase
   - `jobOnHold` / `jobResumed` → a hold banner showing the reason
4. **Tracking phases (63):** `assigned` gets its own phase. The fee note comes from a `cancel_policy` field the server adds to the session (`free` or `fee`, plus the amount, or none).
5. **Stale technician location (59):** when no location update has arrived for 60 seconds, show "Last updated N min ago" and hide the ETA.
6. **No default location (61):** use the job's stored coordinates. If there are none, hide the ETA.
7. **Session routing table test:** a unit test over `SessionResume` covering every status from scenario 11 of the scenarios file, including `pending`, `on_hold`, completed-unpaid and paid-unrated.

**Maps key:** restrict it by Android signature and iOS bundle id before launch. Moving the ETA to the server proxy (60) is post-launch.

### WS-H: Support and records (2.5 days, in parallel)

**Closes:** 100. Scenario 98's receipt items are in WS-D.

1. **Contact Us (100).** In the admin API, add `GET /api/contact-us` (list with filters), `GET /api/contact-us/:id`, `PATCH /:id` (status and assignee) and `POST /:id/replies`, with an ops role and an audit log.
2. Fix `clicks-admin/lib/features/phase2/support_tickets_screen.dart` to use these endpoints and read the correct response key.
3. Store a **category code** instead of the translated label, and backfill existing rows by mapping the en and ar labels to codes.
4. **Customer side:**
   - On submit, return a ticket number and send a push and an inbox entry.
   - Add a "My requests" list showing status and replies.
   - Show the app's error handler message from the `error` key.
5. Send admins a socket event and push for each new ticket.

**Tests:** new `contact-us-admin`: create as customer, list as admin, reply, customer sees it.

---

## 4. Release train

All Flutter changes ship as **one customer-app release (build 1)**. Build 1 **must** contain the forced-update check from WS-F item 6, so every later fix can be enforced on installed copies.

| Step | Gate |
|---|---|
| 1. Merge WS-I, QW, WS-D (completion + ledger) | CI green |
| 2. Merge WS-F, WS-A, WS-G | CI green; migrations dry-run on a staging copy of Atlas |
| 3. Merge WS-E, WS-C, WS-H, WS-B | CI green |
| 4. Run `sync-indexes` and the backfills on staging | Dry-run output reviewed |
| 5. Deploy APIs to staging; build 1 to TestFlight and internal testing | — |
| 6. **The 20 must-test scenarios** on one iPhone and one Android, using the SkipCash sandbox | All pass. Failures go back to the owning workstream |
| 7. Config checklist on production Railway (from the scenarios file) | All ticked; test webhook returns 200; support number test-called |
| 8. Production: indexes, backfills, API deploy, then the store release | `min_app_version` set to build 1 |

**Server/app compatibility:** the uncommitted server change that requires an OTP at registration must not reach production before build 1 is in testers' hands. If public builds of the old app exist, the server needs a temporary path that accepts a `verified` registration OTP record created in the last 10 minutes for that phone, with no code sent. Remove it once `min_app_version` forces build 1.

---

## 5. Timeline (two engineers: one API-heavy, one Flutter-heavy)

| Week | Engineer 1 (API) | Engineer 2 (Flutter + API) |
|---|---|---|
| 1 | Phase 0 · WS-I · WS-D items 1–4 | QW · WS-F (API items 1–5) |
| 2 | WS-D items 5–11 · WS-A items 1–3, 6 | WS-F (app items 6–9) · WS-G |
| 3 | WS-A items 4–10 · WS-E | WS-C · WS-H |
| 4 | Fix what device testing finds · production checklist | WS-B · build 1 · run the 20 device tests |

**Critical path:** WS-D's completion service → WS-A's cancel and link services → WS-C's notifier → WS-B's app listeners → build 1 → device tests. A slip in WS-D delays everything after it.

---

## 6. Deferred until after launch

These are not blockers. They are scheduled for the first post-launch sprint:
- 10: keep the previous OTP valid
- 15: device-token array
- 16: phone-number change via OTP
- 22, 23: plate transfer and normalisation
- 25, 26: vehicle lock during a job
- 32: polygon coverage
- 33: customer updates the location
- 35: cap on skip-vehicle SOS
- 60: server-side ETA proxy
- 75: SMS fallback for "arrived"
- 87: quote approval and price list. **Decide the policy before launch**; build after.
- 88: customer cash acknowledgement
- moving to the Redis socket adapter

---

## 7. Open items, answered 7 November 2026

1. **SkipCash supports refunds.** WS-D item 7 calls the SkipCash refund API. Manual references stay as a fallback for refunds done in the portal.
2. **Account deletion deactivates the membership.** Status becomes `cancelled`, with reason `account_deleted`. There is no automatic refund; finance can refund through the admin refund flow.
3. **Admins control membership coverage.** WS-E adds:
   - a per-plan `coversEmergency` toggle that replaces the hardcoded emergency exclusion;
   - admin subscription actions: grant/comp, extend, cancel (immediately or at period end), refund, and usage adjustment, all audited, with screens in `clicks-admin`.
4. **Escalation recipients are configurable (as recommended).** `ONCALL_PHONE` is a comma-separated env value, and can be overridden by an admin "ops settings" value. If neither is set, escalation alerts all admins by push and socket.
5. **No public store build exists.** The temporary registration compatibility path is not needed.
