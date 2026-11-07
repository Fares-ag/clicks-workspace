# Release checklist: customer-app hardening

**Branch:** `integration/customer-hardening`. It is based on `baseline-2026-11-07` (58d50cc) and **is not pushed**.
**What it contains:** the fixes from `CLICKS_CUSTOMER_FIX_PLAN.md`, delivered as six workstream branches:
- identity and support (`fix/ws-fhi-identity`)
- dispatch (`fix/ws-ag-dispatch`)
- money (`fix/ws-de-money`)
- realtime and notifications (`fix/ws-bc-realtime`)
- admin UI (`fix/ws-admin-ui`)
- integration fixes made on top

Scenario status lives in `CLICKS_CUSTOMER_FAILURE_SCENARIOS.md`.

**Verified locally on 8 November 2026:**
- API integration suite: 376/376 pass (56 suites).
- `clicks-user`: `flutter test` 19/19; `flutter analyze` 0 errors.
- `clicks-technician`: `flutter analyze` 0 errors.
- `clicks-interface` and `clicks-finance-web`: production builds pass.
- `clicks-admin`: still has 83 analyzer errors that predate this work (see "Known gaps").

**Not yet verified:** nothing has run on Railway, in the SkipCash sandbox, on a real iPhone, or in a browser.

---

## 1. Before the deploy: settings on Railway

The customer/tech API **refuses to start** in production if a required setting is missing (`assertProductionConfig`). Set these first, or the deploy will crash-loop.

### Required on the customer/tech API (blocks boot)

| Setting | Value |
|---|---|
| `LAUNCH_PUBLIC_SOS` | `true` (it must be set explicitly) |
| `SKIPCASH_WEBHOOK_SECRET` | the webhook key from the SkipCash portal. It is separate from the key secret. |
| `SMS_PROVIDER` | `smsala`. `console` is refused in production. |
| `CORS_ORIGINS` | a comma-separated list of the web origins |
| `SINGLE_INSTANCE` or `REDIS_URL` | `SINGLE_INSTANCE=true`, since `railway.tech.toml` now pins 1 replica with no deploy overlap |

### Required on the admin API

| Setting | Value |
|---|---|
| `CORS_ORIGINS` or `FRONTEND_URL` | the admin web origin(s) |
| `CUSTOMER_TECH_API_URL` and `INTERNAL_API_SECRET` | Must match the tech API. Hold/resume/complete/cancel notifications and SOS claim messages travel this route through the outbox. |

### Strongly recommended

| Setting | Why |
|---|---|
| `SUPPORT_PHONE` | **Decision needed**: the app fallback is `+97470919191`, taken from the receipt PDF. The timer screen and web support page used to show `7009 0220`. Choose the number ops actually answers and test-call it. It can also be set in the admin app under Ops Settings, which takes priority. |
| `ONCALL_PHONE` | A comma-separated E.164 list that the SOS escalation texts at 5 minutes. It can be set under Ops Settings instead. If neither is set, escalation only pushes to all admins. |
| `SENTRY_DSN` | Both APIs. Payment, refund and SMS alerts go to Sentry and are invisible without it. |
| `MIN_APP_VERSION_IOS`, `MIN_APP_VERSION_ANDROID` | Leave unset until build 1 is in the stores, then set it to build 1. Older builds are then forced to update. |
| `APP_STORE_URL_IOS`, `APP_STORE_URL_ANDROID` | Where the forced-update screen sends people |

### Optional, with defaults

- **OTP:** `OTP_ALLOWED_PREFIXES` (`+974`), `OTP_SENDS_PER_HOUR` (3), `OTP_SENDS_PER_DAY` (10), `OTP_DAILY_ALERT_THRESHOLD` (500)
- **Customer sessions:** `CUSTOMER_TOKEN_TTL` (7d), `CUSTOMER_TOKEN_REFRESH_WINDOW_DAYS` (3), `CUSTOMER_TOKEN_REFRESH_GRACE_DAYS` (7), `CUSTOMER_ANONYMISE_AFTER_DAYS` (30)
- **SOS:** `SOS_ESCALATE_REPUSH_MS` (2 min), `SOS_ESCALATE_ONCALL_MS` (5 min), `SOS_ESCALATE_CUSTOMER_MS` (8 min), `SOS_CLAIM_RELEASE_MS` (5 min), `SOS_ESCALATION_SWEEP_MS` (30 s), `SOS_ESCALATION_DISABLED`, `SOS_CREATE_MAX_PER_WINDOW` (3), `SOS_CREATE_WINDOW_MS` (10 min)
- **Payments:** `PAYMENT_RECONCILE_INTERVAL_MS` (5 min), `PAYMENT_RECONCILE_DISABLED`, `SKIPCASH_REFUND_PATH` (`/api/v1/payments/refund`)
- **Other:** `CUSTOMER_CANCEL_FEE_QAR`, `TECH_API_NOTIFY_TIMEOUT_MS` (5000)

---

## 2. Data steps against production Atlas, in this order

Production runs with `autoIndex: false`, so new indexes only exist once step 5 builds them. Run every script with `--dry-run` first and read the output before writing.

1. **Take an Atlas snapshot.**
2. Run `node scripts/check-sos-job-consistency.js`. It is read-only and exits 2 if anything is flagged. Resolve any customer with more than one live SOS (pending or in_call). Otherwise the new unique "one active SOS per customer" index fails to build.
3. Deduplicate customers. These must run before the unique indexes:
   - `node scripts/dedupe-customer-phones.js --dry-run`, then `--apply`
   - `node scripts/dedupe-customer-emails.js --dry-run`, then `--apply`, or `--merge` to merge accounts that differ only by email case
4. Backfills:
   - `node scripts/backfill-service-request-status.js --dry-run`, then `--apply`. Old bookings whose job finished are closed, so customers stop landing on the waiting screen.
   - `node scripts/backfill-contact-us.js --dry-run`, then `--apply`. Adds ticket numbers and category codes.
   - `node scripts/backfill-payment-attempts.js --dry-run`, then `--confirm`. Adds a ledger row for each SkipCash checkout still open, so the reconciler picks it up.
5. Indexes: `node scripts/sync-indexes.js --dry-run`, then `--apply`. Do **not** pass `--drop` on the first run.
6. Later and recurring: `node scripts/anonymise-deleted-customers.js`. The API also starts an anonymiser.

---

## 3. Deploy order

1. **Customer/tech API first.** It has the new internal endpoints that the admin API calls (`/api/notifications/internal/deliver`, `/api/sos/notify-*`, `/api/customers/internal/disconnect`). Check that `/api/config/public` returns the expected flags and support number.
2. **Admin API.**
3. **Web apps:** `clicks-interface` and `clicks-finance-web`.
4. **Mobile builds:** customer, technician, admin.
   - Bump `AppConfig.appVersion` in `clicks-user`. It is the value sent as `X-App-Version`.
   - The first launch of this customer build wipes secure storage once, so testers are signed out one time.

**Technician app:** this build is required. The API now accepts **cash only** from technicians. Card, wallet and Fawran are confirmed by SkipCash or by finance with a reference. A technician on the old build who taps "card" will be refused.

---

## 4. Checks with a real device or provider

**SkipCash sandbox:**
1. Pay a job by card.
2. Open checkout on two devices and pay both. The second payment must appear as `duplicate_capture` in the Payment Ledger.
3. Close the WebView before the webhook arrives. The job must turn paid within 5 minutes.
4. Request a **refund** and approve it as a different Super Admin.
   - It must show "Sent to SkipCash, awaiting confirmation" until SkipCash confirms, then succeed with a credit note.
   - **The refund request format is not verified.** It is based on SkipCash's contract as implemented by the community SDK `samt-qa/skipcash-laravel`: body `Id, KeyId, Amount`, signature over `Id,KeyId`. If the sandbox rejects it, that is the place to look (`clicks-shared/services/skipcashClient.js` `refundPayment`, `clicks-shared/utils/skipcash.js` `REFUND_SIGN_KEYS`).
5. Membership:
   - Open checkout twice and pay the first link. The membership must activate.
   - Use a free visit, cancel that job, and check the visit is given back.

**Real iPhone with the app killed:**
1. Run a full job. A lock-screen push must arrive for assigned, en route, arrived, completed and paid.
2. Tapping each push opens the right job.
3. One tray entry per job.

**The 20 launch tests** in `CLICKS_CUSTOMER_FAILURE_SCENARIOS.md` ("The 20 scenarios that must be tested before launch"), on one iPhone and one Android phone against staging.

---

## 5. Known gaps and items for the owner

- **About 20 source files were blank before this work began**, and are still blank:
  - Mostly admin-app screens and helpers: heat map, edit job, import jobs, admin/business/client forms, vehicle screens, technician logs, dashboard charts, `qatar_date.dart`, `dropdown_value.dart`, `dashboard_summary.dart`, `job_reassign_reasons.dart`.
  - Also `clicks-user/lib/features/services/service_booking_card.dart` (unused), a phone test, and several QA scripts.

  Cursor's local history shows them blank since at least 3 November, with entries labelled "Undo Create Diff". Git has no copy, because they were never committed. As a result **the Flutter admin app does not compile** (83 analyzer errors). The admin web and finance web are unaffected.

  Three tracked QA scripts were also blanked and *can* be restored from commit `c0513c8`: `qa-tech-speed.js`, `qa-customer-push-notification.js`, `qa-business-portal-admin-popup.js`.
- **Cancellation fee:** `cancel_fee_due` is still only a flag. The fee amount comes from `CUSTOMER_CANCEL_FEE_QAR` for display, but nothing collects it. Either decide to waive it, or build collection after launch.
- **Admin payment ledger:** it shows only the newest 200 attempts (no paging).
- **Leftover dart processes:** two `dart` / `dartvm` processes from a hung `flutter test` run (PIDs 24632 and 51908, started 01:09) are still running on the development machine. End them in Task Manager.
- **Deferred to after launch** (plan section 6): previous-OTP grace, multiple device tokens, phone-number change, plate transfer and normalisation, polygon coverage, customer location updates, server-side ETA, SMS fallback for "arrived", quote approval, customer cash acknowledgement, and the Redis socket adapter.
