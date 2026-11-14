# Clicks Customer Product Demo — Stage 1: Inspection & Plan

**Date:** 2026-10-10
**Scope:** Inspect the real Clicks customer app and available tooling; propose storyboard, shot list and demo-account plan before anything is built.
**Status:** Inspection complete. Nothing rendered yet. Two decisions needed from you (end of document).

---

## 1. What I verified in the product

Everything below was checked against the running code and live endpoints, not the docs.

### The app

| Item | Finding |
|------|---------|
| App | `clicks-user`, Flutter, **v1.1.6+16** |
| Features present | `welcome, auth, home (SOS), services, activity, my_cars, notifications, settings, language, splash, main` |
| In-journey screens | `timer_sos_screen`, `in_call_screen`, `technician_tracking_screen`, `job_in_progress_screen` |
| Brand | `#981F1F` primary, `#00d8b4` accent, `#17181A` near-black — matches the brief exactly (`colors_manager.dart`) |
| Logo | `assets/icons/clicks_logo.svg` present |
| Live journey states | `SosCreated → SosInCall → TechnicianAssigned → TechnicianAccepted → TechnicianEnRoute → LocationUpdated → TechnicianArrived → JobStarted → JobCompleted`, plus `SosExpired`, `SosCancelled`, `JobCancelled` (`sos_cubit.dart`) |

### Verified on-screen copy (the only wording the video will use)

From `assets/translations/en.json`:

- Welcome: **"Assisted / Anytime, / Anywhere, / Just a Click Away"**, "Get Started"
- Home: **"SOS"**, "Request Service", "Tap SOS for emergency roadside assistance"
- Waiting: "Searching for a technician…", **"Technician Found!"**, **"Sit tight, we're enroute"**, "Help is on the way"
- Dispatch: "Technician Assigned", "In Call with Job Dispatcher", "A technician is on the way. They will call you before arriving. Please stay in a safe location."
- Tracking: **"Technician is on the way!"**, "Technician has arrived!", "Working on your vehicle", "ETA"
- Job: "Job In Progress", "Technician is working on your vehicle"
- Services: "Choose a service", "When do you need it?" / **Now · Schedule**, "Booking confirmed", "Our team is reviewing your request and will arrange a technician."
- Rating: "How was your experience with {name}", "Thank you for your review!"
- Service catalogue (real list): Battery Change, Oil Change, Full Service, Car Wash (Interior / Exterior / Full / Full Polish), Tire Change, Car Tinting, Breakdown Vehicle

From **clicks.qa** (verified live):
- "Assisted Anytime, Anywhere"
- "Fast, Reliable Emergency Help When You Need It Most"
- "Open the app and press the SOS button to instantly alert our support team."
- "Automatically share your exact location with dispatch units to speed up response."

Everything in the narration and every on-screen title will come from these two lists. No invented claims, no response-time or coverage promises.

### Environment and tooling

| Tool | Status |
|------|--------|
| Flutter 3.44.6 | ✅ |
| Android emulator `blox_api_35` | ✅ running — `emulator-5554`, **1080×2400**, API 35, **userdebug** image, `adb root` works |
| Physical device | ❌ none attached right now (the Samsung A16 used in earlier QA is disconnected) |
| `adb screenrecord` | ✅ available (portrait MP4, ~3 min per clip, no audio) |
| Node 24.18 / npm 11.16 | ✅ |
| Remotion | ✅ reachable on npm (4.0.534); bundles its own FFmpeg |
| Standalone FFmpeg | ❌ not on PATH — Remotion's bundled binary covers render + trim |
| OpenSSL 3.5.7 | ✅ (needed for the local HTTPS path below) |
| Cached `mongod` 7.0.24 | ✅ — a full local stack is possible with no external database |

### Backends

| Endpoint | Status |
|----------|--------|
| `clicks-tech-api-production.up.railway.app/api/health` | ✅ `{"status":"ok","db":"up"}` |
| `stg-tech-api.clicks.qa` (the app's staging default) | ❌ **down / no DNS** — a plain debug build points here and would fail |
| `clicks.qa` | ✅ live |
| **Local stack** (cached mongod + the real customer-tech API, seeded) | ✅ **booted and proven**: `/api/health` ok, demo customer login returns a token |

### Proven on the emulator (not just read from code)

The profile APK was built, installed on `emulator-5554` and launched. Captured
stills are in `footage/stills/`:

| Frame | What it proves |
|-------|----------------|
| `01-launch.png` | App boots; Android notification permission prompt appears first (will be pre-granted before filming) |
| `02-welcome.png` | **Style frame.** Welcome screen on brand crimson, Clicks wordmark, "Assisted / Anytime, / Anywhere, / Just a Click Away", "Get Started" |
| `03-login.png` | Login screen: hero photo, Login/Signup tabs, **Phone Number + Password**, "Sign In", "Forgot Password?" — confirms phone-password login |

No debug banner and no profile overlay in profile mode: the footage is clean.

### Two corrections worth flagging

1. **Customer login is by phone number, not email.** `POST /api/customers/login` takes `phone_number`. Earlier QA in this workspace recorded "customer@clicks.local → 401" as a blocked account; it was simply the wrong field. The demo customer **does** work, on both local and production.
2. **The customer app has no in-app payment step.** There is no payment screen and no payment copy anywhere in the app. Payment is collected by the *technician* (cash / card / wallet / fawran). The customer side shows **"View Receipt"** with amount in QAR inside Activity Details. Section E of the brief asks for "payment confirmation" — I will show the receipt and completion instead, and say so in the narration rather than implying in-app payment exists.

---

## 2. How I propose to capture the footage

### Recommended: self-contained local stack (no production writes)

```
cached mongod (127.0.0.1:27099, fictional seed data)
        │
  real customer-tech API  (127.0.0.1:5101)
        │
  local TLS proxy (https://10.0.2.2:5443)  ← cert signed by a CA installed as a
        │                                     SYSTEM cert on the rooted emulator
  clicks-user PROFILE build on emulator-5554
        │
  adb screenrecord → footage/*.mp4
```

Why this shape:

- **Full control of the journey.** I can drive dispatch and the technician from the API side, so the camera catches *Searching → Technician Found → En route → Arrived → In progress → Completed → Rate* exactly when I want, instead of waiting on real operations.
- **Zero production risk.** No job rows, no SOS requests and no customer data are written to the production database. The brief says not to modify production apps, databases or APIs — this honours that literally.
- **No changes to `clicks-user` or `clicks-api`.** The app is pointed at the local stack purely with build-time flags (`--dart-define=API_BASE_URL=…`, `SOCKET_URL=…`). The TLS proxy lives in `clicks-customer-demo-video/tools/`, outside both apps.

Two constraints forced this exact shape, both verified:
- The app ships `usesCleartextTraffic="false"`, so a plain `http://10.0.2.2` API is blocked → hence HTTPS + a system CA on the emulator (possible only because the image is `userdebug` and `adb root` works).
- A **release** build fail-closes on any local/emulator API URL (`_assertReleaseSafeUrl`) → hence **profile** mode, which has no debug banner and no overlay, so footage stays clean.

### Fallback if you prefer

**Film against production** with the demo account (it works). Honest trade-off: showing En route / Arrived / In progress / Receipt requires a real job to move through real statuses, which means writing demo rows to the production database and using a real technician account. I would not do that without you saying so.

---

## 3. Demo-account and data plan

All identities fictional, seeded locally only. Nothing real appears on screen.

| Role | Identity | Notes |
|------|----------|-------|
| Customer (hero) | **Ahmed Khalil**, +974 3333 3333 | Already the seeded demo customer; appears as "Welcome, Ahmed" |
| Vehicle | Toyota Camry, plate **12345** (fictional) | Shown in My Cars and vehicle confirm |
| Technician | **Omar Al-Thani** | Seeded demo technician; name appears on tracking + rating |
| Dispatcher | admin@clicks.local | Only used API-side to advance the job; not shown unless we do the ops segment |
| Locations | Al Markhiya / Al Daayen, Doha | Real Doha geography, fictional pin |

On-screen PII check before render: no real phone numbers, no production job IDs, no tokens, no internal URLs, no live customer records.

---

## 4. Proposed storyboard — target 105 s

| # | Chapter | Time | Content |
|---|---------|------|---------|
| A | Open | 0:00–0:06 | Clicks logo reveal on near-black; thin road-line motif draws through; line from the app's own welcome screen: **"Assisted anytime, anywhere."** |
| B | Introduce | 0:06–0:17 | Phone enters frame; real Welcome → Home. Title: **"Roadside assistance in your pocket"**. Sub: "Qatar" |
| C | **Emergency SOS** | 0:17–0:46 | The spine of the film. Home ("Having an Emergency?") → press **SOS** → confirm vehicle → optional service → waiting timer "Searching for a technician…" → **"Technician Found!"** → dispatcher call state → "Sit tight, we're enroute" |
| D | Scheduled services | 0:46–1:00 | Services tab → "Choose a service" → Battery Change → **Now / Schedule** → "Booking confirmed" + "Our team is reviewing your request…". Calm counterweight to C |
| E | During & after | 1:00–1:18 | Live tracking map, "Technician is on the way!" → "Technician has arrived!" → "Job In Progress" → completion → **receipt (QAR)** → rating "How was your experience with Omar" → "Thank you for your review!" |
| F | Trust & ops | 1:18–1:33 | My Cars, Activity history with statuses, Notifications. Optional ≤12 s admin Live Map / SOS inbox showing the dispatch side |
| G | Close | 1:33–1:45 | Return to brand. Logo + "Assisted anytime, anywhere." + **clicks.qa** |

Pacing: urgent and tight in C (quicker cuts, SOS highlight, subtle tick on confirm), calm and wide in D–F (slower moves, more air), warm on G.

---

## 5. Shot list (each shot = one real screen)

| Shot | Screen (real) | How captured | Dur | On-screen text |
|------|---------------|--------------|-----|----------------|
| 1 | — (motion only) | Remotion | 6 s | Logo + "Assisted anytime, anywhere." |
| 2 | Welcome | emulator | 3 s | "Roadside assistance in your pocket" |
| 3 | Home idle | emulator | 4 s | — |
| 4 | Home "Having an Emergency?" + SOS | emulator | 4 s | callout: SOS |
| 5 | Confirm vehicle sheet | emulator | 3 s | "Confirm your vehicle" |
| 6 | Choose service (optional step) | emulator | 3 s | "Tell us what you need — or skip" |
| 7 | SOS timer / "Searching for a technician…" | emulator | 4 s | step 1 of 3 |
| 8 | "Technician Found!" | emulator | 3 s | step 2 |
| 9 | In-call / "Technician Assigned" | emulator | 4 s | "Dispatch calls you" |
| 10 | "Sit tight, we're enroute" | emulator | 3 s | step 3 |
| 11 | Services list | emulator | 4 s | "Not an emergency?" |
| 12 | Service + Now/Schedule | emulator | 4 s | "Now or later" |
| 13 | "Booking confirmed" | emulator | 4 s | — |
| 14 | Tracking map, en route | emulator | 5 s | "Track your technician" |
| 15 | "Technician has arrived!" | emulator | 3 s | — |
| 16 | "Job In Progress" | emulator | 4 s | — |
| 17 | Activity details + receipt (QAR) | emulator | 4 s | "Receipt" |
| 18 | Rating sheet + thank you | emulator | 4 s | "Rate the work" |
| 19 | My Cars | emulator | 3 s | "Your garage" |
| 20 | Activity history | emulator | 3 s | "Every job, on record" |
| 21 | Notifications | emulator | 2 s | — |
| 22 | *(optional)* admin Live Map / SOS inbox | admin web | ≤12 s | "Behind the app: dispatch" |
| 23 | — (motion only) | Remotion | 10 s | Logo + tagline + clicks.qa |

Portrait phone footage sits in a 1920×1080 frame with branded side panels (crimson-to-near-black), so nothing is cropped and UI text stays legible.

---

## 6. Narration draft (~150 words, ≈105 s at 130 wpm)

Every sentence maps to something visible or to verified clicks.qa copy.

> When something goes wrong on the road, you shouldn't have to work out who to call.
> Clicks puts roadside assistance in your pocket.
> One press of SOS alerts our support team — and shares your exact location with dispatch.
> Confirm your vehicle, tell us what you need, or skip it and let the dispatcher sort the details.
> Then you wait, and the app keeps you company: searching, technician found, help on the way.
> Dispatch calls you to confirm — so you're never left guessing.
> Not an emergency? Book a battery change, a tyre, a service or a wash — now, or scheduled for later.
> Follow your technician to you. Watch the job start. See the receipt in Qatari riyals when it's done, and rate the work.
> Your cars, your history, your notifications — all in one place.
> Clicks. Assisted anytime, anywhere.

---

## 7. Omissions — what I will not show, and why

| Not shown | Reason |
|-----------|--------|
| In-app payment / card entry | **Does not exist** in the customer app; payment is collected by the technician. Receipt shown instead |
| Phone + OTP *login* | Login is phone + **password**; OTP exists for registration and password reset only |
| Push notification banners | Emulator has no Play Services push delivery in this setup; in-app Notifications list shown instead |
| Live technician GPS moving along a route | Tracking screen is real, but a convincing drive-path needs scripted location pings — I'll show the real screen and only claim what it does |
| Response times, coverage, "fastest", "#1" | No verified source; brief forbids |
| Real customers, plates, phone numbers, job IDs | Fictional seeded identities only |
| Technician app | Out of scope for this cut (customer is the hero); admin only if you approve the ≤12 s ops beat |

---

## 8. Two decisions I need from you

1. **Capture source** — local stack (recommended; zero production writes, full journey control) or film against production with the demo account (writes demo rows to the production database)?
2. **Ops segment** — include the ≤12 s admin Live Map / SOS inbox beat, or keep the film 100% customer?

Default if you don't specify: **local stack, ops segment included** (it's the strongest investor/partner beat and the brief explicitly allows it).

---

## 9. Next steps once you confirm

- Stage 2: stand up the TLS proxy + system CA, install the profile build, capture all 21 app shots, deliver 3 style frames.
- Stage 3: build the Remotion package (logo reveal, chapter titles, callouts, phone frame, end card) + narration.
- Stage 4: render a 30–45 s preview for your review.
- Stage 5: full render, QA pass on the actual MP4, deliverables.
