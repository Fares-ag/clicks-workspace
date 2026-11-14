# Clicks customer app (`clicks-user`) vs Qatar roadside-assistance App Store / Play Store launch needs

Inventory date: 13 Nov 2026. Workspace: `c:\Users\TS\Downloads\clicks-workspace`. Claims are from files in that tree plus the cited QA docs and competitor store listings. Production flag values (`customerMembership=false`, `skipcash=false`, `publicSos=true`) are taken from the 13 Nov 2026 lifecycle QA against production, not from live Railway env reads in this session.

Status labels used below:
- **Live on production flags:** code exists, and the 13 Nov 2026 QA against production exercised it (or the flag that gates it was `true`).
- **Implemented, gated:** screens/API exist; a `LAUNCH_*` / SkipCash flag or `kDebugMode` fallback hides or 503s them.
- **Implemented, not production-verified:** code exists; QA explicitly skipped or did not run the journey.
- **Not built:** no customer-app screen, route, or client API found.

---

## What screens, tabs, and journeys exist under `clicks-user/lib/features`?

### Takeaway
The customer app is a four-tab Flutter product (Home / Activity / Services / Settings) plus a full SOS→dispatch→track→pay→rate stack, scheduled-service booking, vehicles, membership screens, SkipCash checkout, garage/on-hold banners, and standard account/legal screens. Auth is phone+password login with a three-step OTP signup; SOS is a Home hero, not a tab.

### Cited Findings

**Bottom tabs (MainScreen)**
- Four tabs, IndexedStack: Home, Activity, Services, Settings, plus a centre FAB that only switches back to Home. — [clicks-user/lib/features/main/ui/view/main_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/main/ui/view/main_screen.dart)
- Tab labels come from `bottom_nav.home` / `activity` / `services` / `settings`. — same file

**Named routes (complete list from Routes + AppRouter)**
- Splash, welcome, login, register, registerSuccess, forgetPassword, home (hosts MainScreen), activity, settings, myCars, changeLanguage, notifications, timerSos, serviceWaiting, findingTechnician, activityDetails, inCall, jobInProgress, technicianTracking, contactUsSuccess, paymentHold, skipcashCheckout, membershipHub / plans / review, forceUpdate, accountInactive, myRequests. — [clicks-user/lib/core/routing/routes.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/core/routing/routes.dart); [clicks-user/lib/core/routing/router.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/core/routing/router.dart)
- Settings sub-screens pushed without named routes: edit profile, change password, contact us, FAQs, privacy, terms, My Cars. — [clicks-user/lib/features/settings/ui/view/settings_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/settings/ui/view/settings_screen.dart)

**Auth**
- Welcome: brand copy “Assisted / Anytime / Anywhere / Just a Click Away”, Get Started. — [clicks-user/lib/features/welcome/ui/welcome_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/welcome/ui/welcome_screen.dart); [clicks-customer-demo-video/docs/STAGE1-INSPECTION-AND-PLAN.md](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-customer-demo-video/docs/STAGE1-INSPECTION-AND-PLAN.md)
- Login: phone + password, Forgot Password, Signup tab always visible. — [clicks-user/lib/features/auth/login/ui/view/login_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/auth/login/ui/view/login_screen.dart)
- Register: step 1 phone + OTP (`RegisterStepOneView`), later name/email/password; POST `/register` with OTP. — [clicks-user/lib/features/auth/register/ui/view/widgets/register_step_one_view.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/auth/register/ui/view/widgets/register_step_one_view.dart); [clicks-user/lib/features/auth/register/ui/cubit/register_cubit.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/auth/register/ui/cubit/register_cubit.dart)
- Forget-password screens exist (step one/two). — [clicks-user/lib/features/auth/forget_password/ui/view/forget_password_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/auth/forget_password/ui/view/forget_password_screen.dart)
- Splash: public config, force-update, account-inactive, session resume. — [clicks-user/lib/features/splash/splash_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/splash/splash_screen.dart)

**SOS (Home hero, not a tab)**
- Home shows welcome name, notifications bell, garage/upcoming banners, SOS pulse button; if `PublicConfig.publicSos == false`, SOS is replaced by a “call us” card. — [clicks-user/lib/features/home/home_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/home/home_screen.dart)
- Vehicle + pin confirmation sheet before SOS. — [clicks-user/lib/features/home/confirm_location_sheet.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/home/confirm_location_sheet.dart)
- Timer / waiting (60 s, then call-support card; also on `highDemand`). — [clicks-user/lib/features/home/timer_sos_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/home/timer_sos_screen.dart)
- “In Call with Dispatcher” is a **status wait screen** (assignment snacks, then tracking), not VoIP or chat. — [clicks-user/lib/features/home/in_call_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/home/in_call_screen.dart)
- Finding-technician after reject/reassign. — [clicks-user/lib/features/home/finding_technician_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/home/finding_technician_screen.dart)
- Live map tracking with ETA polyline, call technician, cancel with fee policy. — [clicks-user/lib/features/home/technician_tracking_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/home/technician_tracking_screen.dart)
- Job in progress: cash and SkipCash Pay now, call dispatch. — [clicks-user/lib/features/home/job_in_progress_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/home/job_in_progress_screen.dart)
- Payment hold (unpaid completed job). — [clicks-user/lib/features/home/payment_hold_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/home/payment_hold_screen.dart)
- SkipCash WebView checkout. — [clicks-user/lib/features/home/skipcash_checkout_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/home/skipcash_checkout_screen.dart)
- Rating stars + comment sheet POSTs `/jobs/:id/rate`. — [clicks-user/lib/features/home/rating_bottom_sheet.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/home/rating_bottom_sheet.dart)
- Garage/returning banner and overdue/upcoming booking cards on Home. — [clicks-user/lib/features/home/garage_job_card.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/home/garage_job_card.dart); [clicks-user/lib/features/home/upcoming_booking_card.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/home/upcoming_booking_card.dart)
- SOS create is a **socket** `createSOS`, gated server-side by `LAUNCH_PUBLIC_SOS`. — [clicks-api/clicks-customer-tech-api/src/services/sosSocketService.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-customer-tech-api/src/services/sosSocketService.js)

**Scheduled services (Services tab)**
- Hardcoded catalogue (10 types): Battery Change, Oil Change, Full Service, Car Wash Interior/Exterior/Full/Full Polish, Tyre Change, Car Tinting, Breakdown Vehicle. No jump-start, fuel delivery, or dedicated towing destination picker. — [clicks-user/lib/features/services/services_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/services/services_screen.dart)
- Sheet: vehicle, **Now vs Schedule** date/time, submit with idempotency key. — [clicks-user/lib/features/services/service_request_sheet.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/services/service_request_sheet.dart)
- Waiting / booking-confirmed screen. — [clicks-user/lib/features/services/service_waiting_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/services/service_waiting_screen.dart)
- Immediate (non-scheduled) POSTs are gated by the same `LAUNCH_PUBLIC_SOS` as SOS; scheduled bookings are not. — [clicks-api/clicks-customer-tech-api/src/routes/serviceRequestRoutes.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-customer-tech-api/src/routes/serviceRequestRoutes.js)

**Tracking / payment / rating** — as above; production QA C1–C4 ran SOS create → admin dispatch → track (ETA 2→1 min) → cash QAR 150 → rate 5. — [clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md)

**Membership**
- Hub, plans, review/checkout screens exist; Settings tile hidden unless `MembershipCubit.enabled`. — [clicks-user/lib/features/membership/membership_hub_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/membership/membership_hub_screen.dart); [clicks-user/lib/features/settings/ui/view/settings_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/settings/ui/view/settings_screen.dart) (`_MembershipSettingsTile`)
- Cubit: `enabled = flags.customerMembership || kDebugMode` (debug builds still show membership when the server flag is off). — [clicks-user/lib/features/membership/membership_cubit.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/membership/membership_cubit.dart)

**Garage**
- Customer sees `at_garage` / `returning` Home banner with garage name, reason, expected ready time; tap resumes session. No garage-picker or parts-status UI. — [clicks-user/lib/features/home/garage_job_card.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/home/garage_job_card.dart)

**Activity**
- Job history list with date-range filter; details; receipt JSON + PDF download; call technician; contact-support sheet. — [clicks-user/lib/features/activity/activity_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/activity/activity_screen.dart); [clicks-user/lib/features/activity/activity_details_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/activity/activity_details_screen.dart)
- Native PDF opener writes a temp file; **web opener always returns `false`**. — [clicks-user/lib/features/activity/receipt_opener_io.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/activity/receipt_opener_io.dart); [clicks-user/lib/features/activity/receipt_opener_web.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/activity/receipt_opener_web.dart)

**Settings / vehicles / language / notifications**
- Settings: profile card + edit, My Cars, membership (gated), language, contact us, my requests, FAQs, privacy, terms, logout (no in-app dark-mode or wallet rows). — [clicks-user/lib/features/settings/ui/view/settings_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/settings/ui/view/settings_screen.dart)
- My Cars: list, add, delete, **Insured** badge if `insurance_id` payload is active; no insurance buy/renew UI. — [clicks-user/lib/features/my_cars/my_cars_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/my_cars/my_cars_screen.dart); [clicks-user/lib/features/my_cars/models/car_response_model.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/my_cars/models/car_response_model.dart)
- Language: `en` / `ar`. — [clicks-user/lib/features/language/change_language_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/language/change_language_screen.dart)
- Notifications inbox. — [clicks-user/lib/features/notifications/notifications_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/notifications/notifications_screen.dart)
- Contact Us is a **ticket form** (success screen + My Requests), not live chat. — [clicks-user/lib/features/settings/ui/view/contact_us_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/settings/ui/view/contact_us_screen.dart)

**Locales and theme**
- `supportedLocales: en, ar`; single light `ThemeData`; text scaling clamped `1.0–1.0`. — [clicks-user/lib/main.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/main.dart); [clicks-user/lib/app_root.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/app_root.dart)
- App version constant `1.1.6+16`. — [clicks-user/lib/core/config/app_config.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/core/config/app_config.dart)

**Intended demo story (product, not extra features)**
- Demo plan uses welcome → login → SOS → timer/in-call → tracking ETA → in-progress → complete → rating, plus Services Now/Schedule. Catalogue matches `services_screen.dart`. — [clicks-customer-demo-video/docs/STAGE1-INSPECTION-AND-PLAN.md](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-customer-demo-video/docs/STAGE1-INSPECTION-AND-PLAN.md)

### Inferences
- The launch-critical customer journey that exists in code is: account → SOS or scheduled service → dispatcher claim (customer waits) → live track → work → cash (and optionally card) → rate → activity/receipt. Membership, SkipCash, and public signup are extra layers on that spine, not separate products.
- “In Call with Dispatcher” is a UX metaphor for “dispatch is handling you”; contact is `tel:` to support/technician, not an in-app call.

### Gaps
- This session did not count `en.json` vs `ar.json` key parity; Arabic completeness is inferred from files + failure scenario 20, not a key-diff.
- Feature folders under `lib/features` that are **not** product journeys: `main`, `splash`, `welcome`, `language`, `notifications` (supporting). No `chat`, `wallet`, `promo`, `favorites`, or `insurance` feature folders exist.

---

## Which launch flags (`LAUNCH_*`, AppConfig, public config) hide features (membership, SkipCash/card, public SOS, signup)?

### Takeaway
Server flags live in `getLaunchFlags()`: `LAUNCH_PUBLIC_SOS`, `LAUNCH_PUBLIC_SIGNUP`, `LAUNCH_CUSTOMER_MEMBERSHIP` (all default **off in production** `NODE_ENV`), plus SkipCash `enabled` derived from keys/`SKIPCASH_ENABLED`. The customer app only **consumes `public_sos`** from `/api/config/public`; membership uses a separate `/api/launch-flags` GET; SkipCash UI in this workspace is **not** pre-hidden by that flag; signup UI is **not** hidden even when the API 503s.

### Cited Findings

**Server flag definitions**
- `publicSos`: `LAUNCH_PUBLIC_SOS`, default `!isProd`.
- `publicSignup`: `LAUNCH_PUBLIC_SIGNUP`, default `!isProd`.
- `customerMembership`: `LAUNCH_CUSTOMER_MEMBERSHIP`, default `!isProd`.
- `region`: `LAUNCH_REGION` or `"QA"`.
- `skipcash`: `getSkipcashConfig().enabled` (keys present unless `SKIPCASH_ENABLED` is false/0/off). — [clicks-api/clicks-customer-tech-api/src/utils/featureFlags.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-customer-tech-api/src/utils/featureFlags.js); [clicks-api/clicks-shared/utils/skipcash.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-shared/utils/skipcash.js) (`getSkipcashConfig`)

**Where flags are enforced**
- SOS create: socket `createSOS` returns `LAUNCH_PUBLIC_SOS_OFF` / 503-equivalent. — [clicks-api/clicks-customer-tech-api/src/services/sosSocketService.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-customer-tech-api/src/services/sosSocketService.js)
- Immediate service requests: `requirePublicSosForImmediate` (scheduled skipped). — [clicks-api/clicks-customer-tech-api/src/routes/serviceRequestRoutes.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-customer-tech-api/src/routes/serviceRequestRoutes.js)
- Register + OTP send/verify: `requirePublicSignup` → 503 `LAUNCH_PUBLIC_SIGNUP_OFF`. — [clicks-api/clicks-customer-tech-api/src/routes/customerRoutes.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-customer-tech-api/src/routes/customerRoutes.js)
- Membership routes: `requireCustomerMembership` → 404 `LAUNCH_CUSTOMER_MEMBERSHIP_OFF`. — [clicks-api/clicks-customer-tech-api/src/routes/membershipRoutes.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-customer-tech-api/src/routes/membershipRoutes.js)

**Public config payload (what the server publishes)**
- `GET /api/config/public` returns `flags.public_sos`, `public_signup`, `customer_membership`, `skipcash`, plus `region`, `min_app_version`, `store_url`, `support_phone`, `dispatch_hours: "24/7"`, Qatar `coverage.bounds`, OTP prefixes. — [clicks-api/clicks-customer-tech-api/src/routes/configRoutes.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-customer-tech-api/src/routes/configRoutes.js)
- Unauthenticated `GET /api/launch-flags` returns the raw `getLaunchFlags()` object (`customerMembership`, `skipcash` camelCase). — [clicks-api/clicks-customer-tech-api/src/createApp.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-customer-tech-api/src/createApp.js)

**What the Flutter app actually reads**
- `PublicConfig.load()` stores **only** `flags.public_sos` (plus support phone, min version, store URL). It does **not** store `public_signup`, `customer_membership`, or `skipcash` from public config. — [clicks-user/lib/core/config/public_config.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/core/config/public_config.dart)
- Home SOS button vs call-us card: `PublicConfig.publicSos == false`. — [clicks-user/lib/features/home/home_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/home/home_screen.dart)
- Membership: `MembershipApi.launchFlags()` GET `/api/launch-flags`; hide Settings tile if `!enabled`; debug still enables. — [clicks-user/lib/features/membership/membership_api.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/membership/membership_api.dart); [clicks-user/lib/features/membership/membership_cubit.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/membership/membership_cubit.dart)
- Login Signup tab has **no** `publicSignup` check. — [clicks-user/lib/features/auth/login/ui/view/login_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/auth/login/ui/view/login_screen.dart)
- Job in progress always renders **Pay now** (SkipCash) plus **Pay cash**; `SkipcashPay` maps `SKIPCASH_DISABLED` to an error snack, it does not hide the button. — [clicks-user/lib/features/home/job_in_progress_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/home/job_in_progress_screen.dart); [clicks-user/lib/features/home/skipcash_pay.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/home/skipcash_pay.dart)
- `AppConfig` is compile-time `ENV` / API URL / Maps / Sentry / version only — **no `LAUNCH_*` dart-defines**. — [clicks-user/lib/core/config/app_config.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/core/config/app_config.dart)

**Production values as of 13 Nov 2026 QA (not re-probed here)**
- `launch-flags`: `customerMembership=false`, `skipcash=false`. Membership QA **SKIP**. — [clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md)
- `publicSos=true` (scenario #27 PASS). — same file
- `/api/config/public` live but `min_app_version` and `store_url` **null** both platforms (forced update cannot trigger). `support_phone` **null**; app falls back to `+97470919191`. — same file; [clicks-user/lib/core/config/public_config.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/core/config/public_config.dart)
- QA notes a same-day unpushed branch `fix/customer-qa-2026-11-13` that hides Pay now when `flags.skipcash=false`; that branch is “Not pushed, not merged, not deployed.” **This workspace’s `job_in_progress_screen.dart` still always shows Pay now.** — [clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md); [clicks-user/lib/features/home/job_in_progress_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/home/job_in_progress_screen.dart)
- QA also notes the launch *decision* was “card and membership live at launch” while production has both off. — same QA file, bug 3

**Docs vs production**
- Soft-launch doc still lists `LAUNCH_PUBLIC_SOS=true` / `LAUNCH_PUBLIC_SIGNUP=true` as intended. — [clicks-api/SOFT_LAUNCH.md](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/SOFT_LAUNCH.md)
- MVP scope lists the same three `LAUNCH_*` vars. — [clicks-api/MVP_SCOPE.md](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/MVP_SCOPE.md)

### Inferences
- Classification for a store binary built from **this** tree against **current production flags**:
  - **Live:** login, SOS (flag on), tracking, cash pay, rating, activity/receipt API, vehicles, scheduled-service UI, language, contact-us, session resume.
  - **Implemented, gated off in production:** membership (API 404 + Settings tile hidden in release), SkipCash (API `SKIPCASH_DISABLED`; UI still offers Pay now in this tree).
  - **Implemented, client-ungated / server-gated:** signup (button always shown; OTP/register 503 if `LAUNCH_PUBLIC_SIGNUP=false`). QA skipped register on production because it sends real SMS, so **this session cannot claim the production signup flag value**.
  - **Config present but inert:** forced-update (`min_app_version`/`store_url` null); support-phone override (null → hardcoded fallback).

### Gaps
- Production `LAUNCH_PUBLIC_SIGNUP` value was not in the 13 Nov QA table (register skipped). Do not assume it matches SOFT_LAUNCH.md.
- Railway env was not read in this research pass; flag values are from the QA doc’s production probe that day.

---

## What competitor-standard features are missing?

### Takeaway
Qatar RSA listings (Guls, QIC) and generic RSA apps sell SOS, live tracking, driver contact, cash+card, promo codes, saved cards, insurance/RSA bundling, in-app support, and often fuel/jump-start/towing-to-destination. Clicks **has** SOS, GPS pin, live track+ETA, `tel:` contact, cash, receipt PDF (native), multi-vehicle, EN/AR locale switch, cancel-with-fee copy, 60s wait then call-us, and a membership *product* that is **flagged off**. It **does not have** in-app chat, share-ETA, customer wallet, promo codes, saved cards, favorite locations, insurance purchase, towing destination picker, queue-position wait transparency, dark mode, or real accessibility (text scale is clamped).

### Cited Findings

**Competitor / market (what “typically needs” means here)**
- Guls (Qatar 24/7 RSA): towing, flat tire, battery charge, fuel; auto location; confirmation of who is coming and ETA; real-time tracking; contact driver; cash or card with **multiple cards on file**; **promo codes**. — [Guls](https://www.gulsapp.com/)
- QIC app (Qatar App Store / Play): SOS roadside assistance, policy wallet, claims, **24/7 in-app support**, garage service history, secure payments, car wash/maintenance booking, bilingual market presence. — [QIC App Store](https://apps.apple.com/qa/app/qic-insurance-market-travel/id1620043397); [QIC Play](https://play.google.com/store/apps/details?hl=en_US&id=app.qd.qatardrive)
- Wain by QMIC: maps/traffic plus “access to road-side assistance” (adjacent, not a dedicated RSA app). — [Wain on Play](https://play.google.com/store/apps/details?hl=en&id=com.qmic.itrafficmon)

**Feature-by-feature vs this codebase**

| Need | Clicks customer status | Evidence |
|---|---|---|
| Live chat with dispatch/tech | **Not built.** Contact is `tel:` and a Contact-Us ticket. In-call screen is status-only. | [in_call_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/home/in_call_screen.dart); grep of `clicks-user` found no chat SDK; [contact_us_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/settings/ui/view/contact_us_screen.dart) |
| Share ETA | **Not built.** No `share_plus` / `Share.share` in `clicks-user`. Tracking shows ETA on-device only. | Grep `share_plus` / `Share.` in clicks-user: no matches; [technician_tracking_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/home/technician_tracking_screen.dart) |
| Invoice / receipt PDF | **Implemented.** Activity details fetch `/api/receipts/job/:id` and open PDF on iOS/Android; **web always fails**. QA: receipt PDF HTTP 200 on production. Device viewer **not** exercised. | [activity_details_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/activity/activity_details_screen.dart); [receipt_opener_io.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/activity/receipt_opener_io.dart); [receipt_opener_web.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/activity/receipt_opener_web.dart); [qa-customer-lifecycle-2026-11-13.md](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md) |
| Promo codes | **Not built** in customer app (no promo/coupon strings or APIs in `clicks-user`). | Grep `promo`/`coupon` in clicks-user dart: no product matches |
| Wallet | **Not a customer product.** Job payment enum includes `"wallet"` for **technician/admin/finance** collection, not a customer stored-value wallet. | [clicks-api/clicks-shared/models/Job.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-shared/models/Job.js); technician `active_job_screen.dart` payment methods |
| Multiple vehicles | **Implemented, live.** My Cars list + add; QA listed Toyota Camry 2021. Two-live-jobs handled as scenario 62 in tracking/in-progress. | [my_cars_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/my_cars/my_cars_screen.dart); [qa-customer-lifecycle-2026-11-13.md](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md) |
| Favorite locations | **Not built.** SOS uses current GPS + confirm-pin; no saved-place model/UI. | [confirm_location_sheet.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/home/confirm_location_sheet.dart); no favorite-location matches |
| Insurance | **Partial / not a journey.** `insuranceInfo` / Insured badge only; no buy, claim, or policy wallet. | [car_response_model.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/my_cars/models/car_response_model.dart); [my_cars_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/my_cars/my_cars_screen.dart) |
| Towing destination | **Not built.** Tracking `destination` is the **customer pin** for the tech route, not a customer-chosen drop-off. Garage drop-off is admin/tech-driven (`GarageJobCard`). | [technician_tracking_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/home/technician_tracking_screen.dart); [garage_job_card.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/home/garage_job_card.dart) |
| Wait-time transparency | **Partial.** 60s countdown then “call us”; `high_demand` from SOS ack shows the call card immediately. **No queue position / “you are 3rd”.** | [timer_sos_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/home/timer_sos_screen.dart); [sos_cubit.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/core/sos_services/sos_cubit.dart) `highDemand` |
| Cancel with fee disclosure | **Implemented.** Tracking uses server `cancelPolicy.kind` `free`/`fee`/`contact_support`; label “Cancel (fee may apply)” when en route; dialog includes `fee_amount` when present. QA F: label change observed; **no cancel executed** on production. | [technician_tracking_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/home/technician_tracking_screen.dart); [qa-customer-lifecycle-2026-11-13.md](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md) |
| Scheduled vs SOS | **Implemented as two journeys.** SOS = Home emergency; Services = Now (also SOS-flagged) or Schedule. | [home_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/home/home_screen.dart); [service_request_sheet.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/services/service_request_sheet.dart); [serviceRequestRoutes.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-customer-tech-api/src/routes/serviceRequestRoutes.js) |
| Jump-start / fuel | **Not in customer catalogue.** Membership default exclusions mention `'Towing', 'Jump Start'` but Services grid has neither jump-start nor fuel. | [services_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/services/services_screen.dart); [membership_models.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/membership/membership_models.dart) |
| Card on file / multiple cards | **Not built.** SkipCash is per-job WebView checkout, not stored cards. And SkipCash is **off** in production. | [skipcash_checkout_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/home/skipcash_checkout_screen.dart); QA skipcash=false |
| Arabic RTL completeness | **Partial.** `en`+`ar` locales; RTL-aware page transition; booking codes mapped to i18n. Hardcoded English remains: Activity date picker `SELECT DATE RANGE`/`DONE`; in-call English month names/`AM`/`PM`; some semantics labels. Failure #20 still lists leftover English at SOS/payment. `LAUNCH_PUBLIC_SIGNUP_OFF` is **not** in `_legacyKeys` (SOS off is). | [main.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/main.dart); [app_page_route.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/core/routing/app_page_route.dart); [activity_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/activity/activity_screen.dart); [in_call_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/home/in_call_screen.dart); [booking_errors.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/core/helper/booking_errors.dart); [CLICKS_CUSTOMER_FAILURE_SCENARIOS.md](file:///c:/Users/TS/Downloads/clicks-workspace/CLICKS_CUSTOMER_FAILURE_SCENARIOS.md) §20 |
| Dark mode | **Not built.** Single light `ThemeData`; no `ThemeMode` / `darkTheme`. | [app_root.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/app_root.dart); grep ThemeMode in clicks-user: none |
| Accessibility | **Weak.** `MediaQuery.withClampedTextScaling(min: 1.0, max: 1.0)` disables Dynamic Type; some `Semantics` on header buttons. Not an a11y-complete app. | [app_root.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/app_root.dart); [header_icon_button.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/core/components/header_icon_button.dart) |
| Quote approval before work | **Not built** (failure #87: technician can set price up to QAR 100,000 with no customer approval). | [CLICKS_CUSTOMER_FAILURE_SCENARIOS.md](file:///c:/Users/TS/Downloads/clicks-workspace/CLICKS_CUSTOMER_FAILURE_SCENARIOS.md) §87 |
| Membership at store launch | **Gated off** in production despite screens existing. | QA G SKIP; [membership_cubit.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/membership/membership_cubit.dart) |
| Push notifications | **Implemented in code, not store-ready on this tree:** `google-services.json` missing (`.broken`); QA could not test FCM. | [qa-customer-lifecycle-2026-11-13.md](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md); [main.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/main.dart) FCM init |

Apple HIG / Play pre-launch (from files, not invented policy): force-update and store URLs are **null**, so the app cannot send users to the store. Account deletion exists in Settings cubit (failure #4/#5). Portrait-only. — [public_config.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/core/config/public_config.dart); [settings_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/settings/ui/view/settings_screen.dart); [main.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/main.dart)

### Inferences
- For a **Qatar RSA store listing comparable to Guls**, the missing customer-visible gaps that are actually “not built” (vs merely flagged off) are: in-app chat, share trip, promo codes, saved payment methods, favorite pins, fuel/jump-start SKUs, customer-chosen tow destination, queue position, dark mode, and Dynamic Type.
- Card pay and membership are **product-complete enough to ship behind flags**, but production has them **off**, so a public store user would only get cash SOS + scheduled booking + call support.
- QIC-style insurance/wallet/claims is a different category; Clicks is a dispatch RSA app, not an insurer. Treating insurance as a launch blocker would be a positioning choice, not a missing Clicks screen.

### Gaps
- No first-party IWA / QIC RSA-only competitor teardown of every screen was available beyond store listing copy. “Typically needs” is grounded in Guls + QIC listing bullets, not a full competitive UX audit.
- Play/App Store review checklists (Data safety, account deletion demo account, Arabic metadata) were not inspected in store consoles.

---

## What does the technician/admin product support that the customer never sees?

### Takeaway
Ops and field apps own dispatch inbox, live fleet map, job/lead/finance/refunds, membership **admin**, technician settlement (cash/card/wallet/Fawran), invoice as a tech screen, signature/repairs/price-setting, and SOS claim/schedule/close. The customer never sees those controls; they only see downstream effects (in-call, tracking, garage banner, payment hold).

### Cited Findings

**Admin (`clicks-admin` nav — customer has no equivalent)**
- Dashboard, Admin Management, Technician Management, Vehicle Management, Live Map, Heat Map, Job Management, Leads, Business Management, Finance, Refunds, Payment Ledger, Failed Events, Finance Users, Membership Plans, Customer Memberships, Ops Settings, **SOS Inbox**, Service Requests, Performance, Source Configurator, Partner Management, Support Tickets, Clients. — [clicks-admin/lib/core/navigation/admin_nav_config.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-admin/lib/core/navigation/admin_nav_config.dart)
- Admin SOS REST: claim-next, claim, takeover, **schedule SOS**, close SOS. — [clicks-api/clicks-admin-api/src/routes/sos.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-admin-api/src/routes/sos.js)
- Production QA C2: dispatch used **admin web** “Create job” to assign Omar; customer only left the timer/in-call screens. — [qa-customer-lifecycle-2026-11-13.md](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md)

**Technician (`clicks-technician`)**
- Screens include active job, add job, **invoice**, add subscription, vehicle details, status (online), notifications. — glob of `clicks-technician/lib/features/**/*_screen.dart`
- Technician confirms collection as **cash / card / wallet / Fawran** (customer app only offers cash + SkipCash). — [clicks-api/clicks-customer-tech-api/src/controllers/jobController.js](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/clicks-customer-tech-api/src/controllers/jobController.js) `TECH_PAYMENT_METHODS`; failure #85
- Technician InvoiceScreen is a dedicated read-only invoice UI. Customer uses Activity “view receipt” instead. — [clicks-technician/lib/features/home/ui/view/invoice_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-technician/lib/features/home/ui/view/invoice_screen.dart)
- Audit: tech sets price up to QAR 100,000; adds repairs; proximity-gated start; customer signature required to complete. Customer has no quote-approve UI. — [CLICKS_PRODUCTION_READINESS_AUDIT.md](file:///c:/Users/TS/Downloads/clicks-workspace/CLICKS_PRODUCTION_READINESS_AUDIT.md) §5–8; [CLICKS_CUSTOMER_FAILURE_SCENARIOS.md](file:///c:/Users/TS/Downloads/clicks-workspace/CLICKS_CUSTOMER_FAILURE_SCENARIOS.md) §86–87
- Finance portal + settlements exist (`clicks-finance-web`); customer never sees audit/refunds. Refunds nav is admin-only. — [admin_nav_config.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-admin/lib/core/navigation/admin_nav_config.dart); failure #83 “no refund endpoint” from **customer** perspective

**Effects that leak to the customer without giving them the control**
- Job on hold / at garage / returning → Home banners and session resume. — [garage_job_card.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/home/garage_job_card.dart)
- Reassign → Finding Technician screen. — [in_call_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/home/in_call_screen.dart)
- Admin cancel → snack + Home. — [job_in_progress_screen.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/features/home/job_in_progress_screen.dart)
- Support tickets the customer files **do** appear in admin Support Tickets; customer sees My Requests, not the ops inbox. — settings `myRequests`; admin `support-tickets`

### Inferences
- Store-launch “what the customer gets” is a **thin slice** of a full dispatch OS. Live map, SOS inbox, finance, refunds, partner/business portals, and technician wallet/Fawran are invisible by design.
- That split is normal for RSA, but it means launch marketing cannot honestly promise in-app dispatcher chat, self-serve refunds, or insurance — those live on other surfaces or not at all.

### Gaps
- Technician app was not fully inventory-walked beyond feature filenames + payment methods (per researcher scope: customer-facing gaps). Signature capture, photos, and parts UI details are in `active_job_screen.dart` (~1300+ lines) and were not line-audited here.

---

## What do QA docs say is skipped or broken?

### Takeaway
13 Nov 2026 lifecycle QA: **SHIP WITH CAVEATS**. SOS happy path on production **worked** (create→dispatch→track→cash→rate). Skipped: membership, card, register/OTP, scheduled/garage journeys, FCM, real-device GPS/PDF. Bugs recorded: stuck in-progress after complete (high), logout hang (high, web), Pay now while SkipCash off (medium–high), overdue bookings hijack session (medium), Activity stars 0 after a 5-star save. Older failure-scenario and Aug 2026 production-readiness audits are **harsher** (many payment/refund blockers, no observability) and partly predate later fixes; they still list store-relevant holes (Arabic leftovers, forced-update unset, missing `google-services.json` in current QA).

### Cited Findings

**`qa-customer-lifecycle-2026-11-13.md` (production, web build, 13 Nov 2026)**

Verdict: SHIP WITH CAVEATS. Tested **web** current tree vs production, not the store binary. — [qa-customer-lifecycle-2026-11-13.md](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md)

**Passed (live on production flags)**
- Login (phone `33333333`); vehicles list; SOS create; admin dispatch; track ETA; cash complete; rate; session API matched screens except bug 1; NYC pin `OUTSIDE_COVERAGE`; cancel label changes; `publicSos=true`; GPS pin confirmation when fix unreliable; token refresh 7 days. — same file, gates + C1–F, H

**Skipped (explicit)**
- **G Membership:** `customerMembership=false`, `skipcash=false`.
- **FCM / push:** `clicks-user/android/app/google-services.json` missing (2-byte `.broken` + `.example`).
- **Card payment:** disabled by flags.
- **Register/OTP:** skipped (real SMS + real account on production).
- **Double-tap SOS / cancel races:** not on production (one QA job); covered by integration tests.
- **Scheduled service and garage/on-hold:** “not run; outside this checklist.”
- **Device-only:** GPS permission prompts, PDF viewer, iOS/Android lifecycle.
- Cancel itself: read-only (no job cancelled).

**Broken / caveats (that day’s findings; some claimed fixed on unpushed branch)**
1. High: cold-start mid-job never opens socket → stuck on in-progress after complete; rating only from Home. Files: `splash_screen.dart`, `job_in_progress_screen.dart`.
2. High: logout stays on Settings (web 2/2); `deleteToken()` uncaught without Firebase — **Android without `google-services.json` likely same**.
3. Medium–high: Pay now shown while SkipCash 503 `SKIPCASH_DISABLED`.
4. Medium: past-due bookings never expire; demo account Oct 28 / Nov 11 pending bookings take over session (`session_kind=scheduled`).
5. Low–medium: Activity Details 0 stars after rating 5.
- Smaller: SOS→job form omits vehicle; dispatcher free-text shown as Service Details; Welcome name missing after cold start; duplicate Job Id `CLK-26-0147`; `support_phone` null; admin SOS age “127717:19”.
- Forced update PARTIAL (`min_app_version`/`store_url` null).
- Scenario 58 (lost signal at complete) **still broken** on cold-start path at time of write; same-day branch claims socket + 15s resync fix, **not deployed**.

**`CLICKS_CUSTOMER_FAILURE_SCENARIOS.md` (100 scenarios; mixed ✅ / ◐ / BROKEN)**

Still relevant to **store launch product**, even where later branches marked ✅:
- #19 forced update originally NOT HANDLED; now code exists but production values null (QA H).
- #20 Arabic: PARTIAL; SOS/payment/forgot-password English leftovers; `LAUNCH_PUBLIC_SIGNUP_OFF` unmapped in the older note. Current `booking_errors.dart` maps `LAUNCH_PUBLIC_SOS_OFF` and generic `errors.$code`.
- #27 SOS flag: app now hides SOS when public_sos false (implemented).
- Payments #77–#88: display vs charge mismatch, double session, webhook/refund absence, technician marking wallet/card, no customer quote approval — several tagged **launch blockers** in that document. Later work (PaymentAttempt, SkipCash disable) may have moved some; **this research did not re-verify each against current tests**. Treat as “audit said blocker; confirm before enabling SkipCash.”
- #83: no customer refund path.
- #87: no quote approval.
- Pre-launch config checklist in that file: `LAUNCH_PUBLIC_SOS=true`, SkipCash webhook secret, SMS provider, single replica or Redis, Sentry DSN, Maps key restriction, one support phone. — [CLICKS_CUSTOMER_FAILURE_SCENARIOS.md](file:///c:/Users/TS/Downloads/clicks-workspace/CLICKS_CUSTOMER_FAILURE_SCENARIOS.md)

**`CLICKS_PRODUCTION_READINESS_AUDIT.md` (19 Aug 2026)**

- Verdict: **not ready for Qatar public launch** at scale; ~5.5/10; soft-launch only after Phase 0 (secrets, observability, earnings race, deploy-from-git). — [CLICKS_PRODUCTION_READINESS_AUDIT.md](file:///c:/Users/TS/Downloads/clicks-workspace/CLICKS_PRODUCTION_READINESS_AUDIT.md)
- Customer app called the **strongest Flutter app**: OTP, SOS socket, live tracking, receipts, rating, EN/AR, FCM both platforms (as of August — **contradicted** by 13 Nov QA missing `google-services.json`).
- Product completeness 6.5/10; UX consistency 5.0; monitoring 2.0; testing 3.0.
- Explicit customer-app gap: `sos_cubit` emit-after-await without `isClosed`; production API host `*.up.railway.app` because `tech-api.clicks.qa` DNS missing. AppConfig still points production at `https://clicks-tech-api-production.up.railway.app`. — audit §5; [app_config.dart](file:///c:/Users/TS/Downloads/clicks-workspace/clicks-user/lib/core/config/app_config.dart)
- August claimed “i18n customer app complete”; November failure #20 and hardcoded English strings **contradict completeness**.

**Conflicts to preserve (do not silently pick one)**
- August audit: customer FCM “working on both platforms” vs November QA: `google-services.json` missing, FCM untestable.
- August: i18n complete vs November + current source: leftover English.
- Launch *decision* “card and membership live at launch” vs production flags both false (QA bug 3).
- Same-day fix branch claims bugs 1–5 fixed; **not in this workspace’s `job_in_progress` Pay-now gating, and not deployed**.

### Inferences
- For a store reviewer / public customer **today**, the only production-proven spine is **cash SOS** (plus login, cars, activity). Everything else is either flagged off, skipped in QA, or broken on cold start / logout / overdue bookings.
- Enabling SkipCash for store launch would re-open the failure-scenario payment cluster (#77–#85, #83 refunds) unless those have been closed since the failure doc; the 13 Nov QA did not retest card at all.

### Gaps
- Failure-scenario file is not dated in the header excerpt; some ✅ claims may post-date the August audit and pre-date November QA. Status of each of the 100 scenarios vs **this** tree was not re-run.
- Scheduled-service and garage journeys have **no production evidence** of working or failing — they are untested, not proven missing.

---

## Cross-cutting inventory (for the report writer)

### Implemented and live on production flags (13 Nov 2026 QA + this tree)
Welcome, phone/password login, splash/session resume, Home SOS (publicSos true), confirm location, timer, in-call wait, tracking+ETA, cash pay, rating, Activity list, receipt API 200, My Cars list, Settings (language, contact us, legal, logout UI), four-tab shell, Qatar coverage reject.

### Implemented but gated / inert in production
Membership hub/plans/checkout (flag false; hidden in release Settings). SkipCash checkout screens (flag false; button still shown in this tree). Forced update screen (values null). Public signup UI (always shown; API may 503). Debug-only membership preview catalog.

### Implemented, not production-verified
Scheduled Now/Schedule booking, garage/returning banners, payment hold, finding-technician, cancel-with-fee execution, native PDF viewer, FCM, register/OTP, Arabic full-pass, logout on device, two-vehicle live jobs.

### Not built (no customer files)
In-app chat, share ETA, promo codes, customer wallet / saved cards, favorite locations, insurance purchase/claims, towing destination picker, queue-position wait, dark mode, Dynamic Type, quote approval, self-serve refunds, fuel delivery / jump-start SKUs.
