# Clicks Customer Product Demo — video project

A 90–120 s investor/partner demo of the **Clicks customer app** (`clicks-user`), built from real product
footage plus original motion graphics. Nothing in this folder changes the product: the apps, APIs, databases
and deploy configs are read-only from here.

## Where things are

```
src/                              Remotion motion package (the film's source)
  index.jsx                       entry: loads Helvetica Neue, registers the root
  Root.jsx                        compositions: the film, plus one per chapter
  Video.jsx                       THE CUT — chapter order and lengths live here
  theme.js                        brand tokens, phone geometry, grain
  components/                     Backdrop, PhoneFrame, Callout, Type, Caption, Stage, NameTag
  scenes/                         one file per chapter
public/                           assets Remotion serves (clips, stills, logo, fonts, vo, music)
deliverables/
  clicks-customer-demo.mp4        the film — 1920x1080, 30fps, H.264 CRF 12, narration + music, 1:23
  preview-40s.mp4                 review cut: first 40 s
  scene-timeline.md               every shot, its source and its length
  narration/narration-script.md   timed narration + notes
  narration/audio/                the recorded narration clips
  style-frames/                   3 frames at 1920x1080 showing the look
docs/
  STAGE1-INSPECTION-AND-PLAN.md   what the product actually does, storyboard, shot list, narration, omissions
  STAGE2-CAPTURE-REPORT.md        what was filmed, how, what it cost production, and the open blocker
footage/
  clips/                          13 motion takes, H.264 30 fps 468x1040 (the real app, gdigrab window capture)
  stills/final/                   24 screens at native 1080x2400
  stills/raw/                     exploratory grabs kept for reference; not for the cut
deliverables/
  style-frames/                   3 frames at 1920x1080 showing the intended look
assets/
  brand/                          Clicks logo (from clicks-landing), app logo
  fonts/                          Helvetica Neue, the product's own typeface (from clicks-user)
tools/
  emu.sh                          emulator helpers: shot, peek, tap, swipe, dm, geo, reset_app
  journey.cjs                     drives dispatch + technician against production, including `techpath`,
                                  which walks the technician along a route so the tracking map has something real to show
  styleframes.mjs                 renders the style frames; the design reference for the Remotion build
  polish-vo.sh                    trims, EQs, compresses and levels the raw narration takes
  measure-name.mjs                finds text boxes and colours in a capture, in device pixels
  prod.sh                         production API endpoints and demo credentials used during capture
  README-local-stack.md           how to bring up a local API + Mongo, if production is ever off-limits
```

## Ground rules this project follows

- Only real screens. No redrawn UI, no invented features, no mocked data presented as real.
- The demo account only: **Demo Customer / +974 3333 3333**, a Toyota Camry with plate `123456`. No real
  customer names, numbers, plates or job IDs appear in any frame.
- No claims about response times, coverage or market position — there is no verified source for them.
- Every row written to production during filming is listed in the Stage 2 report and left in a terminal state.

## Reproducing a capture session

```bash
source tools/emu.sh      # ADB + ffmpeg helpers, assumes the blox_api_35 AVD is running
reset_app                # relaunch into a clean status bar
shot final/s03-home-idle # 1080x2400 still
peek final/s03-home-idle # downscaled copy for a quick look

# motion: gdigrab the emulator window while driving the device
"$FF" -f gdigrab -framerate 30 -draw_mouse 0 -i "$WIN" -t 30 \
  -c:v libx264 -preset veryfast -crf 16 -pix_fmt yuv420p footage/clips/take.mp4 &
```

`adb screenrecord` does not work on this AVD (see the Stage 2 report), which is why capture is host-side.

## Building the film

```bash
npm run studio     # Remotion Studio: scrub, tweak, see changes live
npm run preview    # 40 s review cut  -> deliverables/preview-40s.mp4
npm run render     # the whole film   -> deliverables/clicks-customer-demo.mp4
npm run styleframes
```

Rendering uses the Chromium that Playwright already has on this machine
(`--browser-executable`), so Remotion does not download a second browser.

## Current stage

Stages 1-5 delivered: the film renders end to end at 1:38. Two things are open and both need a decision
from the project owner, not more work on this side:

1. Shot 13 ("Booking confirmed") is still blocked by the stranded service request described in
   §6 of `docs/STAGE2-CAPTURE-REPORT.md`. The services chapter stops at the date and time pickers.
2. The technician's name is patched in the edit rather than renamed on the account — see
   `deliverables/README.md`. Renaming the account and re-filming is an option if you prefer real UI.

The capture build must be **release-signed**: the Maps API key is restricted to the release certificate, and
a debug-signed build renders an empty grey map with no error anywhere. See §5 of the Stage 2 report.
