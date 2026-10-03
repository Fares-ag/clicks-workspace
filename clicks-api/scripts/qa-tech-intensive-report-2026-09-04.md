# Technician App — Intensive QA Report (production, real device)

**Date:** 2026-09-04  
**App:** clicks-technician 1.2.3+16, release APK, `--dart-define=ENV=production` (rebuilt twice, see P0-1)  
**Device:** Samsung SM-A165F (Galaxy A16), Android 16, adb id `RFGL61RQK6L`, package `com.clicks.tech`  
**APIs:** `https://clicks-tech-api-production.up.railway.app`, `https://clicks-admin-api-production.up.railway.app` (Railway). `tech-api.clicks.qa` / `admin-api.clicks.qa` answer but do not serve `/api/health` (`Cannot GET`); the production app config (`lib/core/config/app_config.dart`) targets Railway directly, so Railway was used throughout.  
**Accounts:** technician Omar Al-Thani `+97411111111` (id `6a5ea3b97c12fea43f51ed4f`), admin `admin@clicks.local`. Sara Hassan was not needed.  
**Evidence:** `scripts/qa-evidence/2026-09-04-technician-device/` (screenshots per test ID, logcat excerpt, Phase 1 logs). Local copies of every run also under the session scratchpad.

---

## 1. Executive summary — **NO-SHIP until P0-2 is fixed on Railway; app itself is ship-ready once rebuilt with P0-1**

| Area | Verdict |
|------|---------|
| Auth / session, Online, foreground assignment, accept → en route → arrive → GPS-gated start → payment → signature → Job-ID-gated complete, Activity, receipts | **PASS on device** (D1–D4, D12, D15) |
| Multi-job (two active jobs, switching, focus stability) | **PASS on device** — the earlier "screen jumps to the other job" bug is fixed in this build (D6) |
| Hold request → dispatch approval → on_hold → resume | **PASS on device** (D8, D9) |
| Offline rules, add-job while active | **PASS** (D10 device + API; D7 entry on device, creation via API) |
| Background / killed-app job alerts | **FAIL — server side.** A push sent directly from the Firebase service account reaches the device in ~1 s, but a dispatch assignment never produces a push (D13, D14). Root cause is on the Railway tech-api (P0-2). |
| Production build | **P0-1 found and fixed:** the documented build command omitted `FIREBASE_ANDROID_API_KEY`, so the shipped APK never registered an FCM token. Rebuilt with the key → token registered within seconds. |
| Automated baseline | journey 58/58, intensive 67/69 (2 environmental), multi-job/hold 55/55, add-job 30/30, full-job 15/15, integration 16/16, push chain 9/0/3 WARN, background-alert server chain 6/0/3 WARN |

Ship recommendation: **hold the release** until Railway's tech-api push configuration is verified (P0-2) and the APK is rebuilt with the Firebase key (P0-1, now baked into `BUILD.md` and `scripts/build-apk-production.ps1`). Everything the technician does in the foreground is solid on the device.

---

## 2. Results — all test IDs

### 2a. Phase 1 — automated (Railway)

| ID | Suite | Result | Notes |
|----|-------|--------|-------|
| A1 | `qa-tech-user-journey.js` | **PASS** 58/0/1 WARN | WARN: explicit-GPS start skipped because the API started the job from the technician's stored location (4 m), which is the deployed contract |
| A2 | `qa-tech-intensive.js` | **PASS*** 67/2 | FAIL `local technician frontend up` (no local web server — environmental); FAIL `session clean after intensive run — active=1` (the user's real on_hold job was in the session — environmental, see P1-1) |
| A3 | `qa-tech-multi-job-hold.js` | **PASS** 55/0 | static 21 + live matrix (M1–M10, OH-A0–A6, H3–H6, HR1–HR3) |
| A4 | `qa-tech-add-job.js` | **PASS** 30/0 | |
| A5 | `qa-tech-full-job.js` | **PASS** 15/0 | |
| A6 | `technician-multi-job-hold.integration.test.js` | **PASS** 16/16 | includes MA1 multi-accept |
| A7 | `qa-tech-push-notification.js` | **PASS (server)** 9/0/3 WARN | WARN at run time: no FCM token in DB (P0-1, since resolved), direct notify-technician 401 (local secret differs from production — expected), Firebase send skipped |
| A8 | `qa-tech-background-alert.js` | **PASS (server)** 6/0/3 WARN | same token/secret WARNs; `--send-live` used later as Test D (PASS) |
| A9 | Endpoint ↔ route cross-check (Phase 4) | **PASS** | 45 app endpoints in `end_points.dart`; all have a tech-api route (receipts, maps, notifications mounts verified by hand) |

### 2b. Phase 3 — device matrix

| ID | Scenario | Result | Evidence / notes |
|----|----------|--------|------------------|
| D1 | Login / session | **PASS** | Session survived two reinstalls (`adb install -r`) and two cold starts; Home loads Online. `D1-build2-launch.png` |
| D2 | Go Online | **PASS** (state) | App already Online with FINE + BACKGROUND location and POST_NOTIFICATIONS granted, geolocator foreground service running; the slide gesture itself was not exercised |
| D3 | Foreground assign | **PASS** | Incoming banner within ~5 s of admin create, modal with customer/phone/location/issue/price and Accept. Alarm sound not verifiable over adb. `D3-foreground-assign.png`, `D3-banner-expanded.png` |
| D4 | Accept → complete | **PASS** | Accept → Start En Route (pill + compact sheet) → I've Arrived → "You are near the job location" → Start Job → Collect Payment (cash) → Complete sheet blocked until signature → signature pad → Job ID required (inline error + snackbar) → Complete. Server: completed, paid/cash, `job_reference=QA-DEVICE-D4`, signature present. Activity shows it under the Job ID. Screenshots `D4-*.png` |
| D5 | Proximity gate | **PASS (API) / NOT RUN (device far GPS)** | API: start 6.3 km away → 400 with distance; near → 200 (journey). UI gate ("Move within 200m…", button disabled) verified in code (`active_job_screen.dart` arrived case). Simulating a far GPS fix on the phone needs a mock-location app |
| D6 | Multi-job | **PASS** | B assigned while A on hold → banner → accepted; A resumed by dispatch (in_progress, server priority) → B screen stayed on B for 42 s; Activity lists both; Continue A → A screen stayed on A for 35 s. `D6-*.png` |
| D7 | Add job while active | **PASS (entry) / API (create)** | Add job visible and opens the full form with B active; job creation validated by A4 and the journey own-job path. `D7-2-add-job-form.png` |
| D8 | Hold request | **PASS** | Reason dialog → "Hold requested — waiting for dispatch approval" with reason + Cancel request; job stayed in_progress; server `hold_request.status=pending`. `D8-3-after-submit.png` |
| D9 | Hold approve | **PASS** | Admin approve via API → app showed "On hold — contact dispatch to resume" + reason within 8 s. `D9-1-after-approve-8s.png` |
| D10 | Offline rules | **PASS** | With only the on_hold job the Home slider is enabled (dimmed while a job was active); API: Offline blocked with active job (400), allowed when only on_hold (A3 live) |
| D11 | Reject assigned | **N/A by design** | Incoming modal offers Accept only (ProductRules: no reject/cancel bail-out in the app); API reject works (A2, cleanup used it). Flag if a reject affordance is expected |
| D12 | Payment methods | **PASS** | Device: sheet lists Cash/Card/Wallet/Fawran, cash confirmed → "Complete Job". API: all four methods full lifecycle (A2), card (A1) |
| D13 | Background alert, force-stopped | **FAIL (server)** | No notification in 20 s after admin assign with the app force-stopped (`am force-stop` also makes Android withhold FCM from a stopped app, so this variant can never pass) and with the app killed/backgrounded. **Test D** (direct FCM from the local service account to the same token): notification on `clicks_job_urgent_v4` in 1 s, insistent alarm, screen off. See P0-2 |
| D14 | Background (home) | **FAIL (server)** | App backgrounded (process alive, socket connected): no tray notification after admin assign. Same root cause as D13 |
| D15 | RSA job types | **PASS** | Add job form has the Job type selector (`kJobTypes`, 16 types); technician create of all 16 types passes via API (A2). `D15-add-job-form-bottom.png` |

---

## 3. Failures and findings

### P0-1 — Production APK built without `FIREBASE_ANDROID_API_KEY` → no FCM token ever registered (**fixed**)
- **Repro:** build with the command from the brief / `BUILD.md` (`ENV`, `GOOGLE_MAPS_API_KEY` only), install, log in, wait. `GET /api/technicians/:id` via admin → `fcm_token: none`. Same state on the device's pre-existing 17:10 build.
- **Expected:** token posted to `POST /api/technicians/fcm-token` after session load.
- **Actual:** `lib/firebase_options.dart:28` reads `String.fromEnvironment('FIREBASE_ANDROID_API_KEY')`; with it empty, `Firebase.initializeApp(options: …)` fails on the Dart side, `JobNotificationService.enabled=false`, and `registerTokenWithBackend()` never posts. Release builds suppress `[JobNotif]` logs (`kDebugMode` only), so nothing shows in logcat.
- **Proof:** rebuilt with `--dart-define=FIREBASE_ANDROID_API_KEY=<google-services.json current_key>` → `fcm_token: present(142)` within 25 s of launch; the API path itself was verified separately (POST 200 / DELETE 200).
- **Layer:** app build configuration. **Fix applied:** `clicks-technician/BUILD.md` and `scripts/build-apk-production.ps1` now include the key (read from `android/app/google-services.json`). Consider a code fallback (`Firebase.initializeApp()` with no options on Android, where the google-services plugin already supplies them) so a missing define cannot silently disable push again.

### P0-2 — Dispatch assignment never reaches the device as a push (**open, server**)
- **Repro:** app in background or killed, `POST /api/jobs` (admin) with `assignedTechnician=Omar`. No notification in 20 s (D13, D14). Foreground: banner appears (socket), proving `notify-technician` ran on the tech-api.
- **Expected:** `notifyAssignedTechnician()` (`sosSocketService.js:1553`) emits `newJobAssigned` **and** calls `sendJobAssignedPush(fcm_token, …)`.
- **Actual:** socket half works, FCM half does not. Direct FCM with the local `clicks-technician-qa` service account to the same token arrives in 1 s (Test D), so token, device, channel and app handler are fine.
- **Most likely cause:** `FIREBASE_SERVICE_ACCOUNT_JSON` missing or invalid on the Railway **clicks-tech-api** service — `fcmService.initFirebase()` then logs `[fcm] FIREBASE_SERVICE_ACCOUNT_JSON not set — technician push disabled` and skips sends. Second candidate: the send throws inside the `try` in `notifyAssignedTechnician` (e.g. wrong project's credentials).
- **Layer:** API / Railway env. **Action:** check tech-api Railway logs for `[fcm]` lines at assignment time; set the service-account JSON for project `clicks-technician-qa`; redeploy; re-run D14 then D13 (`am kill`/swipe-away, not force-stop).
- **Related design gap (P2-4):** when the socket delivers `newJobAssigned` to a backgrounded app, the cubit starts the insistent ringtone but posts no tray notification; only the FCM handler does. With FCM down there is no visible alert at all.

### P1-1 — QA preflight cleanup resumed and cancelled a real dispatch job (**fixed in scripts**)
- The user's job `6a9acd4ced281bbe4a41e3f4` (on_hold, "taking it to the garage fkr 2 days") was resumed and then rejected/cancelled at 15:26:44Z with reason "QA multi-job cleanup" — by `qa-tech-multi-job-hold.js`'s `preflightCleanup`, which handled every session job including `on_hold`.
- **Fix:** all four preflights (`qa-tech-multi-job-hold.js`, `qa-tech-user-journey.js`, `qa-tech-full-job.js`, `qa-tech-intensive.js`) now only touch jobs whose `clientName` starts with `QA`, and the hold script never resumes/cancels `on_hold` jobs. Static suites re-run green (23/23, 14/14).

### P2-1 — Activity list showed "In progress" for a job that was on_hold server-side
- Baseline screenshot at 18:23 showed `#41e3f4` as "In progress / Active" while the API returned `on_hold` (approved at 17:15). Either the history list was stale (no refresh since approval) or `on_hold` is not mapped in the list. Re-check `JobDisplay.statusLabel` / history refresh after a hold decision.

### P2-2 — After completing job A with job B still active, the ActiveJobScreen stays open and re-renders as B
- `completeJob` clears `activeJob`, the next session refresh picks B, and the still-mounted pushed screen shows B instead of returning Home. Not wrong, but surprising right after a "Job completed" dialog. Consider popping the ActiveJobScreen on completion.

### P2-3 — Cosmetic
- Request-hold dialog uses the Material default purple Submit/Cancel (theme miss).
- Behind the "Job completed successfully" dialog the sheet momentarily shows "Job not found. Go back and reopen it from Activity."

### P2-4 — No in-screen indicator for a new assignment while on another job's ActiveJobScreen
- The incoming banner is hosted by `MainShell` and the pending-assignments banner lives on Home; on the pushed ActiveJobScreen only the alarm sounds (code review, not exercised).

### Environmental / informational
- `qa-tech-intensive.js`: `local technician frontend up` needs a local Flutter web server; `session clean` FAIL was the user's real on_hold job.
- `tech-api.clicks.qa` / `admin-api.clicks.qa` do not serve `/api/health` (proxy path?), while the app is hard-wired to Railway — worth aligning before the domains are used anywhere.
- Test D leaves an insistent `clicks_job_urgent_v4` notification (`qa-live-*`) on the device until the app is force-stopped; cleanup did that.

---

## 4. Commands run

```powershell
# Phase 1 (from clicks-api, TECH_URL/ADMIN_URL = Railway, TECH_PHONE/TECH_PASSWORD, ADMIN_EMAIL/ADMIN_PASSWORD)
node scripts/qa-tech-user-journey.js
node scripts/qa-tech-intensive.js
node scripts/qa-tech-multi-job-hold.js
node scripts/qa-tech-add-job.js
node scripts/qa-tech-full-job.js
npm test -- tests/integration/technician-multi-job-hold.integration.test.js
node scripts/qa-tech-push-notification.js
node scripts/qa-tech-background-alert.js
node scripts/qa-tech-background-alert.js --send-live        # Test D

# Phase 2 (from clicks-technician)
flutter pub get
flutter build apk --release --dart-define=ENV=production --dart-define=GOOGLE_MAPS_API_KEY=<local.properties> `
  --dart-define=FIREBASE_ANDROID_API_KEY=<google-services.json current_key>   # second build; first build omitted this
adb -s RFGL61RQK6L install -r build/app/outputs/flutter-apk/app-release.apk

# Phase 3 (adb helpers: screencap, input tap/swipe/text, am force-stop / am kill, dumpsys notification, logcat)
adb -s RFGL61RQK6L logcat -v time FirebaseInstallations:V FirebaseInstanceId:V FirebaseMessaging:V FirebaseApp:V FLTFireMsgService:V FLTFireMsgReceiver:V flutter:V JobNotif:V *:E
# jobs assigned via POST /api/jobs (admin), hold approve/resume via /api/jobs/:id/hold-request/approve and /resume
# cleanup: technician reject/cancel of QA jobs, app force-stop + relaunch, svc power stayon restored
```

Environment facts: Flutter 3.44.6 (stable), AGP 8.9.1 (deprecation warning), release signing via `android/key.properties`, Maps key from `android/local.properties`.

---

## 5. Open gaps, ranked

| Rank | Item | Owner / layer |
|------|------|---------------|
| **P0** | P0-2: dispatch push not sent — verify `FIREBASE_SERVICE_ACCOUNT_JSON` (project `clicks-technician-qa`) on Railway tech-api, redeploy, re-test D14/D13 | API / Railway env |
| **P0** | P0-1: rebuild and distribute the APK with `FIREBASE_ANDROID_API_KEY` (build script + BUILD.md updated); optional code fallback in `firebase_options.dart` | App build |
| **P1** | Re-run D13/D14 on device after P0-2; run the logcat checklist (`qa-tech-background-alert-checklist.md`) for Tests B/C | QA |
| **P1** | P1-1 happened on production data: the cancelled job `6a9acd4ced281bbe4a41e3f4` needs dispatch to recreate/restore if it was real | Ops |
| **P2** | P2-1 Activity list status for on_hold jobs; P2-2 post-completion navigation; P2-3 theme/transient text; P2-4 in-screen assignment indicator; D11 decide whether a Reject affordance is wanted | App |
| **P2** | Align `*.clicks.qa` API hostnames with the app config, or drop them from docs | Infra |

Uncommitted working-tree changes from this run: the four QA-script preflight guards, `clicks-technician/BUILD.md`, `clicks-technician/scripts/build-apk-production.ps1`, this report and the evidence folder (about 19 MB of screenshots — drop it from the commit if size matters).
