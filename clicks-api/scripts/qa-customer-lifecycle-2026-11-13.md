# Customer app: full lifecycle QA, 2026-11-13

## Verdict

- **SHIP WITH CAVEATS** (customer build).
- The SOS happy path works end to end on production: create → dispatch → track → arrive → start → pay cash → complete → rate, with the session API matching the screen at every step.
- Fix or decide before a public push: bugs 1 and 3 below. Confirm bug 2 on a real phone.
- What was tested: a **web build of the current working tree** (`integration/customer-hardening` plus uncommitted edits), driven in headless Chrome against production. It is not the store binary; device-only behaviour (push, GPS prompts, PDF viewer) was not exercised.

## Fixes applied (same day)

- Branch **`fix/customer-qa-2026-11-13`** (worktree `.claude/worktrees/customer-qa`, based on `6e5afc0`). Not pushed, not merged, not deployed.
- Verified on a local stack (tech API + sockets on an in-memory database, fixed web build in headless Chrome). API suite 381/381, Flutter 29/29, analyzer 0 errors.
- Bug 1, stuck in-progress screen: **fixed**.
  - Cold start mid-job now opens the socket (`16e0186`); the rating sheet appeared 1.8 s after completion.
  - The in-progress screen also resyncs every 15 s; with the customer's socket cut, it left the screen on the next resync and showed the rating prompt.
- Bug 2, logout: **fixed** (left Settings for Login in about 2 s).
  - Corrected cause: not a hang. Reaching the push service throws when Firebase is not initialised, and the error was uncaught. That applies to any build without a working Firebase setup, so **Android builds without `google-services.json` are very likely affected too**, not only web.
- Bug 3, card button: **fixed**. With `flags.skipcash=false` only "Pay cash to the technician" is offered.
  - Correction to the finding below: the app does show "Card payment is unavailable right now" briefly; I had checked after it disappeared. The dead button was the real problem.
- Bug 4, past-due bookings: **fixed** on the server and in the app.
  - A pending scheduled booking with no job stops driving the session 6 h after its slot (`SCHEDULED_OVERDUE_GRACE_MS`). It stays pending for dispatch and is listed as `overdue`; Home titles it "Booking past its time".
  - After rating, the app now goes to Home, not the old booking screen.
  - Needs the tech API deployed to take effect; the app change alone only fixes the Home title.
- Bug 5, rating stars: **fixed**. Opening the Activity tab refreshes the list.
- `qa-customer-intensive.js`: the cancel probe now runs only on a local stack and only on the QA customer's own job.
- `widget_test.dart` "App smoke test": removed (it cannot build the app without Firebase and localisation, and never passed); replaced by tests of the new logic.
- Not fixed: the smaller observations, forced-update values, `SUPPORT_PHONE`, and the missing `google-services.json`.
- Not done: dispatch still gets no alert for an overdue booking. The two bookings on the demo account (Oct 28, Nov 11) are still pending and should be cancelled or handled by dispatch.

## GATE 1–4

| Gate | Result | Evidence |
|---|---|---|
| 1 Logins | PASS | Customer login 200; session 200 (`session_kind=scheduled`, `can_book_sos=true`); admin API login 200; admin web dashboard loads |
| 2 Automated | PASS with 2 known failures | API 411/412; Flutter 22/23 |
| 3 API script | PASS (1 step skipped on purpose) | 11 PASS, 0 FAIL, 1 WARN |
| 4 UI lifecycle | PASS for C1–C4 + D; 1 FAIL (logout), 3 bugs found | See checklist |

## Password used

- Customer: **`Carage123!`** worked first time. `Customer123!` was not needed.
- Admin `Admin123!` and dispatcher `Dispatch123!` both work.
- Technician Omar `Tech123!` works, but the login field is `phone` (or `email`), not `phone_number` as the prompt says; `phone_number` returns 400.

## Automated

- `npm run test:ci` (clicks-api): 59 suites, **411 passed, 1 failed**.
  - Failed: `contact-us-admin` › "customer submit returns a ticket number, stores a category code and writes the inbox". Known timing flake; it passed 2/2 when rerun alone on 2026-11-12.
- `flutter test` (clicks-user): **22 passed, 1 failed**.
  - Failed: `test/widget_test.dart` "App smoke test": null check in `ScreenUtilInit` (`app_root.dart:23`). It is the stock scaffold test, which builds the app without its startup initialisation. A test problem, not a product one.
- `qa-customer-intensive.js` against production: 11 PASS / 0 FAIL / 1 WARN.
  - **Deviation:** I ran a copy with the `cancel-customer` probe removed. The script takes the newest job in the admin list, whoever owns it, and tries to cancel it with the demo customer's token. On production that job was a real customer's live job (`accepted`, created today). The script should be fixed before anyone runs it on production again.

## Lifecycle checklist

- **A Login/logout: FAIL (logout).**
  - Login with `33333333` + password: PASS. Re-login: PASS. Cold start with no token → Welcome: PASS.
  - Logout: the stored token is cleared, but the app stays on Settings (waited 40 s, reproduced 2/2). See bug 2.
- **B Vehicles: PASS.** My Cars lists Toyota Camry 2021, plate 123456.
- **C1 SOS create: PASS.** SOS `6af6fd1bb0b6295ceaeb0568` created from the UI in about 3 s; app on the timer screen; session `pending_sos`, `can_book_sos=false`.
  - With no accurate GPS fix the app correctly showed "Confirm your location" and required a pin move.
- **C2 Dispatch: PASS.** Done in the admin web UI. The SOS reached the inbox within 8 s; "Create job" claimed it (session `in_call`, app on the in-call screen); job `6af6fea823056263b0d66d9d` created and assigned to Omar; Omar's socket received `newJobAssigned`.
- **C3 Track: PASS.** Tracking screen shows Omar, the van marker and a route; ETA went from ~2 min to ~1 min as the technician moved. Statuses `assigned → accepted → en_route → arrived` matched.
- **C4 Complete: PASS, with bug 1.** Start (15 m from the pin) → in-progress screen; cash selected by the customer (200); technician signed, confirmed cash, completed; rating 5 submitted (200); Activity lists the job; receipt PDF returns 200.
  - The technician steps were driven through the technician API and socket (no technician phone).
- **D Session sync: PASS.** `GET /api/jobs/customer/session` matched the screen after every step, except the stuck screen in bug 1 (the server was right, the app was stale).
- **E Resilience: PASS on the real cold-start path, with bug 1.** Cold start mid-job resumes on the in-progress screen; 12 s in the background and a 10 s network drop both left the right screen.
  - A browser reload on `#/jobInProgress` gives a blank page. Web only: it skips the splash, which a phone cannot do.
- **F Cancel/guards: PASS (read-only).** Cancel label changes from "Cancel this job" (assigned) to "Cancel (fee may apply)" (en route). `can_book_sos` is false during a pending SOS and true with a live job; that matches the code (`!activeSos`, with the live job's vehicle blocked separately). NYC pin rejected with `400 OUTSIDE_COVERAGE`. No job was cancelled.
- **G Membership: SKIP.** `launch-flags`: `customerMembership=false`, `skipcash=false`.
- **H Failure doc, 5 launch blockers retested:**
  - #12 token expiry: FIXED on production. Token lifetime 7 days and `POST /api/customers/token/refresh` returns 200.
  - #19 forced update: PARTIAL. `/api/config/public` is live, but `min_app_version` and `store_url` are null for both platforms, so a forced update cannot be triggered yet.
  - #27 `LAUNCH_PUBLIC_SOS`: PASS. `publicSos=true`.
  - #31 GPS denied/slow: PASS. Pin confirmation is required when the fix is unreliable.
  - #58 lost signal while the technician completes: STILL BROKEN on the cold-start path (bug 1); app resume does resync.

## IDs created and clean-up

- Service request `6af6f821b0b6295ceaeafd59`: created and cancelled by the GATE 3 script.
- SOS `6af6fd1bb0b6295ceaeb0568`: now `accepted`, linked to the job.
- Job `6af6fea823056263b0d66d9d`: `completed`, `paid`, cash, QAR 150, rated 5, reference `QA-LIFECYCLE`.
  - **Not reversible by me:** it is recorded as QAR 150 cash collected by Omar. Finance should exclude or reverse it.
- Omar: set Online 15:01–15:21 Qatar time for the test, then back to Offline (as found). No active job.
- Not touched: the demo customer's three older pending bookings, and a pending SOS from another customer (`#2147A7A5`, Nov 8, level 3) already sitting in the inbox.
- No real technician was assigned. One automation click landed on a real technician in the form; my pre-submit check caught it and nothing was sent.

## Top 5 bugs

1. **High: customer stuck on "Job is in Progress" after the job is paid and completed.**
   - Steps: cold-start the app during a live job → technician confirms cash and completes → screen never changes (30+ s). Background/foreground resyncs, but lands on a stale "Booking confirmed" screen; the rating prompt only appears on Home.
   - Cause: a cold start into a live job never opens the socket (only Home does), and the in-progress screen has no polling.
   - Files: `clicks-user/lib/features/splash/splash_screen.dart`, `lib/features/home/job_in_progress_screen.dart`. A fix for the socket part exists on the unpushed branch `scale/p1-customer-app` (`d198d53`).
2. **High (web confirmed, device unconfirmed): logout does not leave Settings.**
   - Steps: Settings → Logout → Confirm Logout. Token is cleared; the screen stays.
   - Likely cause: `settings_screen.dart:175` awaits `FCMNotificationService.deleteToken()` with no timeout before navigating. Check on a phone, especially offline.
3. **Medium–high: "Pay now · QAR 150.00" is offered while card payment is off.**
   - Steps: in-progress screen → Pay now → `POST /jobs/:id/skipcash/session` returns `503 SKIPCASH_DISABLED`; no visible error after 6 s, button still there.
   - Either hide the button when `flags.skipcash=false`, or enable SkipCash. Note the launch decision was "card and membership live at launch"; production has both off.
4. **Medium: past-due bookings never expire and take over the app.**
   - The demo customer has pending bookings dated Oct 28 and Nov 11. Every login and resync lands on "Booking confirmed · Wed, Nov 11", Home shows "Upcoming booking · Oct 28", and `session_kind` stays `scheduled` after a job completes. Related to scenario #54.
   - File hint: `clicks-api/clicks-shared/utils/customerBookingGuard.js` (session), `session_resume.dart` (routing).
5. **Low–medium: Activity Details shows 0 stars right after a 5-star rating was saved** (server has `rating: 5`). File: activity details screen.

Smaller observations:
- The SOS → job form prefills name, phone and location, but not the vehicle (plate, year), although the SOS carries it.
- The dispatcher's free-text "issue" is shown to the customer as "Service Details".
- "Welcome," has no name on the in-progress screen after a cold start.
- Three different Oct 10 jobs show the same "Job Id: CLK-26-0147" in Activity (the technician's free-text reference).
- Production `support_phone` is null (the app falls back to its built-in number).
- The admin inbox shows the Nov 8 SOS with age "127717:19".
- Seen once, not reproduced: the admin technician list showed Omar Offline a few minutes after he went Online, while the technician API said Online.

## Skipped, and how to unblock

- **Push notifications (FCM):** not testable. `clicks-user/android/app/google-services.json` is missing (only a 2-byte `.broken` and the `.example`). Unblock: restore the real file from Firebase and test on a device.
- **Card payment and membership:** disabled by launch flags. Unblock: enable in the Railway env, then rerun G and the SkipCash scenarios.
- **Register/OTP path:** skipped; it sends real SMS and creates a real account on production.
- **Double-tap SOS, double "Add Job", cancel races:** not run on production (limit was one QA SOS/job). Covered by the integration tests (`sos-e2e`, `sos-cancel-vs-create`).
- **Scheduled service and garage/on-hold journeys:** not run; outside this checklist.
- **Device-only checks:** real GPS permission prompts, PDF receipt viewer, app lifecycle on iOS/Android.
- **Evidence:** 50 screenshots in `C:\Users\TS\AppData\Local\Temp\claude_qa\` (for example `c1-sos-created.png`, `c-move.png`, `c-c4-after-complete-2.png`, `a6-logout-wait.png`, `c4-pay-card.png`). Saved tokens were deleted.
