# Clicks Customer Product Demo — scene-by-scene timeline

1920×1080, 30 fps, 2496 frames (**1:23**), H.264 CRF 12 from PNG frames, narration + music bed. Frame numbers are the composition's; they match
`TIMELINE` in `src/Video.jsx`, so changing one changes the other.

Every "source" column names the real capture the frame comes from. Nothing on screen is a mock-up.

| # | In (frame / tc) | Len | Chapter | Source | What is on screen | Narration |
|---|-----------------|-----|---------|--------|-------------------|-----------|
| 1 | 0 · 0:00.0 | 126 | Logo reveal | motion only | Crimson bloom, Clicks mark, tagline | — (music opens) |
| 2 | 126 · 0:04.2 | 128 | Sign in (a) | `take10-login` 1–11 s @2.4× | Welcome → phone number → password | `02-login` |
| 3 | 254 · 0:08.5 | 127 | Sign in (b) | `take10-login` 17–24 s @1.6× | Filled form → Sign In → Home | |
| 4 | 381 · 0:12.7 | 480 | The emergency | `take13-sos-clean` 1–24 s @1.44× | Home → SOS press → confirm vehicle → submit → live countdown | `03-sos` |
| 5 | 861 · 0:28.7 | 270 | The wait | `take02-assigned` 3–20 s @1.89× | Dispatcher in-call card → "Technician Assigned" | `04-wait` |
| 6 | 1131 · 0:37.7 | 240 | On the way (a) | `take15-tracking-map` 4–30 s @3.25× | **The live map**: technician at West Bay driving in, route drawn, ETA 7 → 2 min | `05a-follow`, `05b-distance` |
| 7 | 1371 · 0:45.7 | 75 | On the way (b) | `take15-tracking-map` 43–45.5 s | "Technician has arrived!", car beside the pin | `05c-arrive` |
| 8 | 1446 · 0:48.2 | 75 | On the way (c) | `take16-inprogress-complete` 6–8.5 s | "Job is in Progress" job card | |
| 9 | 1521 · 0:50.7 | 160 | Done (a) | `take17-rating` 2–7.3 s | Rating sheet, stars tapped, Submit | `06a-pay` |
| 10 | 1681 · 0:56.0 | 65 | Done (b) | `take17-rating` 11–13.2 s | "Thank you for your review!" | `06b-receipt` |
| 11 | 1746 · 0:58.2 | 90 | Done (c) | still `s17-receipt` | Receipt: CLK-26-0147, 150 QAR | |
| 12 | 1836 · 1:01.2 | 135 | Everything else (a) | `take11-services` 1–9 s @1.8× | Service grid | `07-services` |
| 13 | 1971 · 1:05.7 | 75 | Everything else (b) | `take11-services` 15–17.5 s | "Confirm the vehicle" with Now / Schedule | |
| 14 | 2046 · 1:08.2 | 75 | Everything else (c) | `take12-schedule` 2–6.75 s @1.9× | Date picker → time picker | |
| 15 | 2121 · 1:10.7 | 195 | In one place | stills `s19-mycars`, `s20-activity`, `s17-details` | Three screens arriving as a row | `08-everyday` |
| 16 | 2316 · 1:17.2 | 180 | End card | motion only | Clicks mark, tagline, clicks.qa | `09-end` |

## Sound

Narration covers **68 % of the runtime** (56.9 s of 83.2 s). Clip start offsets are the second value in each
`vo` entry in `TIMELINE`; `VO_LEN` next to it holds each clip's length, and `SPEECH` derives the speaking
windows from both.

The music bed (`public/music/bed.wav`) runs underneath and ducks itself: 0.10 while anyone is speaking,
rising to 0.26 in the gaps over a 14-frame ramp, ×1.35 over the logo and end card where there is no voice,
and fading out across the last 45 frames. The ducking is driven by `SPEECH`, so re-timing a line re-times
the duck with it.

Only three silent stretches run past two seconds: the 4.2 s logo opening (deliberate — the music carries it)
and two short holds inside the drive, at 0:43 and 0:48.

## Treatment notes

- **Status bar.** Every shot is cropped by the top 128 of 2400 captured rows, and the phone chrome drawn in
  Remotion stands in for it. This removes the emulator's punch-hole cutout and the black-status-bar artefact
  described in the Stage 2 report. No product UI is cropped.
- **Phone position is fixed per chapter** (left or right), so cuts inside a chapter change the screen without
  moving the device — it reads as a cut inside the phone, not a jump.
- **Callouts are aimed in device coordinates** (`phonePoint()` in `src/components/Stage.jsx`), measured off the
  1080×2400 capture, so a label lands on the control it names even if the phone is rescaled.
- **The map is real and so is the movement.** Google Maps base tiles only render for an APK signed with the
  release key the Maps API key is restricted to, which is why earlier passes came back grey. The film is cut
  from a release-signed build. The technician's position was then driven along a route from West Bay to the
  customer through the production location API, so the marker, the drawn route, the map's zoom and the ETA
  are all the product responding to live state.
- **The technician's name is patched in the edit** — the seeded demo technician's record reads "Omar
  Al-Thani", the film's persona is "Mohammed Khalil". Six measured chips, defined in
  `src/components/NameTag.jsx`. One fictional demo persona for another; nothing else about the UI changes.

## Rendering

```bash
npm run studio     # scrub and edit
npm run preview    # frames 1320-2519 (the map, the close, the receipt) → preview-40s.mp4
npm run render     # the whole film → deliverables/clicks-customer-demo.mp4
```

Rendering uses PNG intermediates at CRF 12 — JPEG frames visibly soften the app's small UI text.

Each chapter is also registered on its own (`Chapter-sos`, `Chapter-wait`, …) so a single beat can be
re-rendered without the rest.
