# Clicks Customer Product Demo — Stage 2: Capture report

**Date:** 10 October 2026
**Decisions applied:** capture against **production** with the seeded demo account; **100 % customer** cut (no admin/ops chapter).
**Status:** footage complete for 20 of the 21 app shots. Three style frames delivered. One blocker needs a decision before Stage 3 locks (see §6).

---

## 1. What was captured

All footage is the real `clicks-user` app (profile build, `--dart-define=ENV=production`, v1.1.6) signed in as
**Demo Customer / +974 3333 3333**, talking to `clicks-tech-api-production.up.railway.app`.
No screen was redrawn, mocked, or re-skinned.

### Motion takes — `footage/clips/` (H.264, 30 fps, 468×1040)

| Clip | Dur | What is in it |
|------|-----|---------------|
| `take13-sos-clean.mp4` | 58 s | **Best SOS take.** Home → SOS press → confirm-vehicle sheet → "Help is on its way!" with the live countdown ring (59→51) → dispatcher claims → "In Call with Job Dispatcher" |
| `take01-sos.mp4` | 70 s | First SOS run. Same arc, but the Android location prompt appears over the countdown |
| `take02-assigned.mp4` | 45 s | In-call → **"Technician Assigned · Omar Al-Thani"** |
| `take03-enroute.mp4` | 44 s | "Sit tight, we're enroute" → "Technician has arrived!" (tracking sheet, ETA, 5.0/5) |
| `take07-tracking.mp4` | 34 s | Second pass of the same transition, cleaner pacing |
| `take04-inprogress.mp4` | 40 s | "Job is in Progress" with job card, technician, vehicle, Call Dispatch |
| `take05-complete.mp4` | 45 s | Completion → rating sheet auto-presents |
| `take06-rating.mp4` | 26 s | Five stars tapped in sequence → Submit → "Thank you for your review!" |
| `take08-activity-browse.mp4` | 36 s | Activity list scroll → Activity Details → back |
| `take09-welcome.mp4` | 24 s | Logout sheet → branded Welcome / Login screen |
| `take10-login.mp4` | 34 s | **Opening beat.** Phone number typed → password → Sign In → Home |
| `take11-services.mp4` | 22 s | Services grid scroll → Battery Change selected → "Confirm the vehicle for this service" |
| `take12-schedule.mp4` | 20 s | Schedule → date picker → time picker |

### Stills — `footage/stills/final/` (24 PNGs, native 1080×2400)

`s02-welcome`, `s03-home-idle`, `s05-confirm-vehicle`, `s06-sos-submitting`, `s07-sos-waiting`,
`s07b-sos-countdown`, `s08-in-call`, `s09-technician-assigned`, `s11-services`, `s11b-service-selected`,
`s12-now-or-schedule`, `s13-schedule-date`, `s13-schedule-time`, `s14-enroute`, `s15-arrived`,
`s16-in-progress`, `s17-details`, `s17-receipt`, `s18-rating`, `s18b-thank-you`, `s19-mycars`,
`s20-activity`, `s21-notifications`, `s22-settings`.

Stills are used for screens that do not animate: at 1080×2400 they are four times the linear resolution of the
motion takes, so they stay crisp when the phone sits ~900 px tall in a 1080p frame.

### Style frames — `deliverables/style-frames/`

| File | Shows |
|------|-------|
| `01-opening.png` | Title treatment, phone-in-frame, brand gradient, logo lockup |
| `02-callout.png` | Annotation language — pointer + label into a real screen, chapter eyebrow, progress list |
| `03-endcard.png` | Closing card: logo, "Assisted anytime, anywhere.", clicks.qa |

Rendered from `tools/styleframes.mjs`, which is the design reference the Stage 3 Remotion package is built
from — same tokens, same grid. Brand values are read from the product, not invented:
crimson `#981F1F`, ink `#17181A`, accent `#00D8B4` (`clicks-user/lib/core/theme/colors_manager.dart`),
Helvetica Neue (`clicks-user/assets/fonts/`), logo from `clicks-landing/public/Logo-white.svg`.

---

## 2. Shot-list coverage against the Stage 1 plan

| # | Shot | Status |
|---|------|--------|
| 1 | Logo reveal | Stage 3 (motion only) |
| 2 | Welcome / login | ✅ `take09`, `take10`, `s02` |
| 3 | Home idle | ✅ `s03`, `take10` tail |
| 4 | Home + SOS press | ✅ `take13` |
| 5 | Confirm vehicle sheet | ✅ `take13`, `s05` |
| 6 | Choose service (optional step) | ✅ folded into 5 and 12 |
| 7 | "Help is on its way!" + countdown | ✅ `take13`, `s07`, `s07b` |
| 8 | In call with dispatcher | ✅ `take13`, `s08` |
| 9 | Technician Assigned | ✅ `take02`, `s09` |
| 10 | Sit tight, we're enroute | ✅ `take03`, `s14` |
| 11 | Services list | ✅ `take11`, `s11`, `s11b` |
| 12 | Service + Now / Schedule | ✅ `take11`, `take12`, `s12`, `s13a/b` |
| 13 | Booking confirmed | ⚠️ **not captured** — see §6 |
| 14 | Tracking, en route | ⚠️ captured, map tiles blank — see §5 |
| 15 | Technician has arrived | ✅ `take03`, `take07`, `s15` |
| 16 | Job in progress | ✅ `take04`, `s16` |
| 17 | Activity details + receipt (QAR) | ✅ `take08`, `s17-details`, `s17-receipt` |
| 18 | Rating + thank you | ✅ `take05`, `take06`, `s18`, `s18b` |
| 19 | My Cars | ✅ `s19` |
| 20 | Activity history | ✅ `take08`, `s20` |
| 21 | Notifications | ⚠️ real screen, but empty — see §5 |
| 22 | Admin / ops beat | ❌ dropped per your decision |
| 23 | End card | Stage 3 (motion only) |

---

## 3. How the footage was captured

| Piece | Choice | Why |
|-------|--------|-----|
| Device | `blox_api_35` AVD, 1080×2400 | the only Android available; the physical handset is not attached |
| Video | ffmpeg `gdigrab` on the emulator window, 30 fps, libx264 CRF 16 | `adb screenrecord` is broken on this AVD — it emits an identical 35 754-byte file whatever is on screen and however long it runs |
| Window size | Win32 `MoveWindow` to a 468×1040 client area | exactly the 0.45 device aspect, the largest that fits a 1080p desktop, so no letterbox and no rescale in capture |
| Stills | `adb exec-out screencap` at native 1080×2400 | four times the linear resolution of the motion path |
| Status bar | SystemUI demo mode (09:41, full wifi, full battery, no notification icons) | removes clock drift and clutter between takes |
| Location | `adb emu geo fix` to Doha (25.3269467, 51.4883967) | the SOS and tracking screens use the real device location |

Helpers live in `tools/emu.sh` (`shot`, `peek`, `tap`, `swipe`, `dm`, `geo`, `reset_app`) and
`tools/journey.cjs` (dispatcher + technician side of the live journey).

---

## 4. What was written to production, and its state now

The brief allowed demo rows once you chose production capture. Everything written is listed here and every row
is in a terminal state.

| Row | What | Final state |
|-----|------|-------------|
| SOS `6aca83d3…fdfb9e` | SOS raised from the app during `take01` | `accepted` → became the job below |
| Job `6aca8462…c6a360` | "Flat tyre on Al Corniche Street", Omar Al-Thani, 150 QAR | **completed**, paid cash, rated 5★, ref `CLK-26-0147` |
| Job `6aca8825…c6a5e4` | second pass for the tracking shots | **completed**, paid cash |
| SOS `6aca8af2…fe011b` | clean SOS take (`take13`) | **cancelled** by the customer, reason "Issue resolved on my own" |

No open SOS, no open job, no technician left holding work: `node tools/journey.cjs state` returns
`active_job: null`, `tech_active_jobs: []`.

Nothing in the production **code, config or database schema** was touched. The two completed jobs are ordinary
demo history on the seeded demo customer and can stay, or be removed by whoever normally prunes demo data.

---

## 5. Findings worth your attention (all pre-existing, none caused by the video)

**P1 — a dispatched service request never reaches a terminal state, and it strands the customer app.**
`ServiceRequest.status` only ever moves `pending → assigned` (`clicks-shared/services/createJobRecord.js:121`)
or `pending → cancelled` (customer cancel). Nothing anywhere sets `completed`, and
`cancelServiceRequest` rejects anything that is not `pending`
(`clicks-customer-tech-api/src/controllers/serviceRequestController.js:266`). Meanwhile
`getActiveServiceRequest` counts `assigned` as active. The demo account is carrying one such row
(`6a820d94eeb734972147a69d`, "Car Wash - Full", assigned 16 Aug, its job since deleted), and the consequences
on the live app are:

- every cold start lands on **"Waiting for dispatch"** instead of Home;
- the **Services tab** pushes that screen instead of the service grid after any relaunch;
- **"Cancel Request"** always fails with *"Only pending service requests can be cancelled"*.

The admin API offers no way out either — `routes/serviceRequests.js` is read-only (GET list, GET by id).
So a real customer in this state is stuck permanently with no self-service and no dispatcher remedy.

**P2 — the in-app notifications list stays empty through a whole job.** A full SOS → assign → en route →
arrive → start → pay → complete → rate cycle produced zero rows: `GET /api/notifications/customer` returns
`{"notifications":[]}`. The customer app therefore shows "No notifications yet" even for a job that just
finished. (Consistent with the push blocker already logged as P0-2 in the technician QA report.)

**P3 — cosmetic.** Popping back from "Waiting for dispatch" leaves the OS status bar painted solid black with
no icons, on Home and on every tab, until the app is restarted. `main.dart:46` sets
`statusBarColor: Colors.transparent`, so the style is being lost on that route's pop.

**Environment, not product:**

- ~~**Google Maps base tiles do not render on this emulator.**~~ **Resolved — and the cause is worth
  knowing.** The capture build was a *profile* build, which Gradle signs with the debug key. The Maps API key
  is restricted to the **release** signing certificate, so the SDK initialised, the key was "accepted", no
  authorization error appeared in logcat, and no imagery was ever served — just grey geometry. Rebuilding with
  `flutter build apk --release --dart-define=ENV=production --dart-define=GOOGLE_MAPS_API_KEY=…`, signed with
  `android/clicks-release.jks`, makes the map render correctly. The film is cut from that release build.
  (Things that did *not* help, for the record: `-gpu swiftshader_indirect`, emulator restarts, waiting.)
  Worth noting for anyone else debugging this: a SHA-1-restricted Maps key fails **silently** on a
  debug-signed build — no error, just an empty map.
- **`adb screenrecord` is broken on this AVD** (identical 35 754-byte output regardless of content), which is
  why capture is host-side.

---

## 6. The one thing blocking a complete cut

Shot 13 ("Booking confirmed") cannot be filmed, and shots 11/12 can only be filmed in the window after a fresh
login, because of the stranded service request described in §5. I did not clear it: your brief says not to
modify the production database for this video, and there is no API that can do it.

Three ways forward — your call:

1. **Clear that one row** (`ServiceRequest 6a820d94eeb734972147a69d` → `cancelled`). One document, on the
   seeded demo account, orphaned since August. Unblocks shots 11–13 and makes the app open on Home again,
   which also removes the black-status-bar artefact.
2. **Give me a second demo customer** on production. Public signup is gated behind `LAUNCH_PUBLIC_SIGNUP` and
   its OTP goes out by real SMS, so I cannot self-serve this.
3. **Ship without shot 13.** The Services chapter still works: grid → select → *Now / Schedule* → date and time
   pickers are all captured. The cut would stop short of the confirmation screen and the omissions list would
   say so. Runtime drops by roughly 4 s.

Option 3 needs nothing from you and I will proceed with it by default. Option 1 produces the better film.

---

## 7. Treatment decisions carried into Stage 3

- **The OS status bar is cropped out of every shot** (top 128 of 2400 rows) and the phone chrome drawn in
  Remotion replaces it. It keeps the frame consistent, removes the emulator's punch-hole cutout, and sidesteps
  the P3 artefact above. Nothing of the product UI is cropped.
- **The tracking beat is framed on the bottom sheet** — status banner, technician, ETA, rating — rather than on
  the empty map. The narration will not claim a live moving map.
- **Notifications (shot 21) is cut** rather than shown empty; it moves to the omissions list.
- The ops/admin chapter is gone, so Chapter F is My Cars + Activity only. Expect the runtime to land around
  **95–100 s** rather than 105 s.

---

## 8. Next

Stage 3: Remotion package (logo reveal, chapter cards, callouts, phone frame, end card) and narration, built
on the tokens in `tools/styleframes.mjs`. Then Stage 4, a 30–45 s preview for your review, and Stage 5, the
full 1920×1080 / 30 fps / H.264 + AAC render with a QA pass on the actual MP4.
