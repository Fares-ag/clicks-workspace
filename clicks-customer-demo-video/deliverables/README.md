# Clicks Customer Product Demo — deliverables

| File | What it is |
|------|------------|
| `clicks-customer-demo.mp4` | The film. 1920×1080 30 fps, H.264 CRF 12 (~5 Mb/s), narration + music at −15.6 LUFS / −1.2 dBTP, **1:23**, 52 MB |
| `preview-40s.mp4` | Review cut: 40 s from 0:37.7 — the map, the arrival, the rating, the receipt and the services. Cut straight out of the master, so the mix is identical |
| `style-frames/` | Three 1920×1080 frames showing the look: opening, callout language, end card |
| `narration/narration-script.md` | Timed narration and notes on what must not be reworded |
| `narration/audio/` | The recorded narration, eleven clips after two were split at their sentence breaks |
| `music/bed.wav` *(in `public/`)* | The music bed, generated to brief and ducked under the voice |
| `scene-timeline.md` | Every shot: in-point, length, which capture it came from, what is on screen |

Motion source is the Remotion project at the repo root (`src/`, `npm run studio`). Raw captures are in
`../footage/`. Everything the film shows was filmed from the running product — see `../docs/STAGE2-CAPTURE-REPORT.md`.

---

## What the film claims, and why each claim is safe

| On screen / in the script | Where it comes from |
|---|---|
| "One press alerts our support team — and sends them your exact location" | The SOS screen's own copy: *"Our team is reviewing your request and will call you before the timer ends."* Location is sent with the request |
| "Confirm your vehicle, or skip it" | The confirm-vehicle sheet has a literal **Skip vehicle** button |
| "Searching. In call. Assigned." | The three real states the app shows, in order, in the captured take |
| "a live ETA" / "watch them close the distance" | The tracking sheet's own ETA pill, counting 7 → 1 min as the technician's real position moves along the route |
| "you pay the technician directly" | There is no in-app payment in the customer app; the technician collects and the API issues the receipt |
| "the receipt is there in Qatari riyals" | The real receipt from the filmed job: `CLK-26-0147`, 150 QAR |
| "now, or scheduled for later" | The **Now / Schedule** toggle on the service sheet, with the real date and time pickers |

No claim is made about response times, coverage, fleet size, availability or market position. There is no
verified source for any of those, and the brief forbids inventing one.

---

## Sound

Narration covers **68 %** of the runtime. The first cut ran 1:42 against 58 s of speech, which left 43 s of
silence and read as dead air; the picture was trimmed to the narration rather than padding the narration out,
so the film is now 1:23. Two lines were split at their own sentence boundaries so the words track the drive
and the hand-off instead of finishing early.

Underneath is an original instrumental bed, generated to brief (warm minimal electronica, ~92 BPM, midrange
left open for voice), then shaped: high-passed at 40 Hz, scooped 2.5 dB at 2.2 kHz so the voice cuts through,
and levelled to −26 LUFS against a −18 LUFS voice. It is laid in by `tools/mix-music.sh`, which ducks it with
a **sidechain compressor keyed off the narration** — so the duck follows the actual speech rather than a
hand-written envelope, and the video stream is copied rather than re-encoded, costing no render and no
further generation loss.

The Remotion project also carries its own duck (`MusicBed` in `src/Video.jsx`, driven by the `SPEECH`
windows) for previewing in the studio.

Final balance: voice −17 dB, music −23 dB in the gaps, master −15.6 LUFS true-peak −1.2 dBTP. The master
lift is a flat +3 dB, not loudnorm — single-pass loudnorm applied time-varying gain and pumped the
music-only stretches up to meet the dialogue.

**The voice is the weakest part and I know it.** It is a first-take synthesis, processed to sit in the mix
(`tools/polish-vo.sh`) but not re-recorded with a better voice, because the vidIQ credit pool ran out
mid-session — see the note in `narration/narration-script.md`. Swapping it is a drop-in.

---

## The map

Earlier passes came back with grey tiles. The cause was the Maps API key being restricted to the release
signing certificate while the capture build was debug-signed — so the SDK initialised, the key was accepted,
and no imagery was ever served. The film is cut from a **release-signed** APK, which is also the real shipping
configuration, and the map renders properly.

The movement is real too: the technician's position was driven along a route from West Bay to the customer
through the production location API (`tools/journey.cjs techpath`), so the marker, the drawn route, the map's
zoom and the countdown from seven minutes are all the product reacting to live state. Nothing is simulated.

---

## Omissions — what is deliberately not in the film

| Not shown | Why |
|---|---|
| In-app card payment | Does not exist in the customer app. The receipt is shown instead |
| Phone + OTP sign-in | Sign-in is phone + password. OTP exists only for registration and password reset |
| Push notification banners | The in-app notification feed stays empty through a complete job on production (logged as P2 in the Stage 2 report), so the film does not show it |
| "Booking confirmed" screen | Blocked by a stranded service request on the demo account — see §6 of the Stage 2 report. The services chapter runs grid → select → Now / Schedule → date and time pickers and stops there |
| Admin / dispatcher console | Dropped at your request; the cut is 100 % customer |
| Real customers, plates, numbers, job IDs | Only the seeded demo identity appears: Demo Customer, +974 3333 3333, a Toyota Camry on plate 123456 |

---

## The technician's name

The filmed job was dispatched to the seeded demo technician, whose production record reads **Omar Al-Thani**.
The persona for this film is **Mohammed Khalil**, so each place the app prints the name is patched in the edit:
a chip in the row's own background colour with the name redrawn in Helvetica Neue, the app's own typeface.

Six places are patched — the "Technician Assigned" card, the tracking sheet en route, the tracking sheet after
arrival, the in-progress job card, the rating sheet, and the activity-details row (twice, once dimmed behind
the receipt dialog). Every box was measured off the capture with `tools/measure-name.mjs` in device pixels, so
the patch lands exactly on the text it replaces; the definitions are in
[`src/components/NameTag.jsx`](../src/components/NameTag.jsx).

This swaps one fictional demo persona for another. No screen, control, number, state or capability is altered,
and the brief explicitly allows fictional names. If you would rather the name be real UI rather than a patch,
renaming that production account and re-filming the six shots is about 25 minutes of work — say the word.
