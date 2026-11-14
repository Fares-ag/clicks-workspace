# Clicks Customer Product Demo — narration script

**Runtime:** 1:23 (2496 frames @ 30 fps)
**Words:** 153, recorded as 56.9 s of speech across a 1:23 film — **68 % coverage**, with a music bed under
the rest. An earlier 1:42 cut left 43 s of silence and read as dead air; the picture was trimmed to the
narration rather than the other way round.
**Voice:** recorded. ElevenLabs "Eric - Smooth, Trustworthy" (`cjVigY5qzO86Huf0OWal`) via the vidIQ
voiceover tool — calm, mid-40s male, neutral English. Eight takes, one per chapter, so each line is cut to
its own beat rather than drifting against a single long read.
**Audio files:** `audio/`. Two takes are split at their own sentence boundaries — `05a/05b/05c` and
`06a/06b` — so the words track the drive and the hand-off rather than finishing early.
**Processing:** `tools/polish-vo.sh`. Raw text-to-speech is dry and evenly loud, which is most of what makes
it sound synthetic; the chain trims dead air, caps internal gaps at 0.22 s, high-passes, adds chest at
180 Hz and presence at 4 kHz, compresses gently, puts a very short room reflection on it, and normalises
every line to −18 LUFS so they all sit the same under the music.
**Register rule:** every sentence describes something visible on screen at that moment. No claims about
response times, coverage, fleet size or market position — there is no verified source for any of them.

The film is cut to read with the sound off: each line below is also on screen as a caption in the same beat,
so the picture stands alone if the video is watched muted.

---

## Known limitation

The voice is the first take, and it is serviceable rather than great. Regenerating it with a warmer voice
(ElevenLabs "Brian — Deep, Resonant and Comforting" is the better fit for this register) and a more
conversational rewrite needs vidIQ credits; the account is at 11 of the 14 a single line costs, and the
renewable pool refills on **15 October 2026**. Everything else about the sound — the density, the timing,
the duck, the processing — is already in place, so a re-record is a drop-in: same filenames into
`public/vo/`, re-run `tools/polish-vo.sh`, re-render.

---

## Timed script

| In | Out | Chapter | Line |
|----|-----|---------|------|
| 0:00 | 0:04 | Logo | *(no voice — the card carries "Assisted anytime, anywhere.")* |
| 0:05 | 0:12 | Sign in | When something goes wrong on the road, you shouldn't have to work out who to call. Clicks puts roadside assistance in your pocket. |
| 0:13 | 0:28 | SOS | One press alerts our support team, and sends them your exact location. Confirm your vehicle, or skip it and let the dispatcher sort the details. A dispatcher reviews the request and calls you before the timer runs out. |
| 0:29 | 0:36 | The wait | Searching. In call. Assigned. Your technician is named before they set off, so you are never left guessing. |
| 0:38 | 0:41 | On the way | Follow them in, with a live ETA. |
| 0:41 | 0:43 | On the way | Watch them close the distance. |
| 0:46 | 0:48 | On the way | Then they are at your car, and the work starts. |
| 0:51 | 0:53 | Done | When it is finished you pay the technician directly, |
| 0:55 | 1:00 | Done | the receipt is there in Qatari riyals, and the app asks how it went. |
| 1:02 | 1:09 | Services | Not an emergency? Book a battery change, a tyre, a full service or a wash. Now, or scheduled for later. |
| 1:11 | 1:15 | In one place | Your cars, your history, your receipts. All in one place. |
| 1:18 | 1:21 | End card | Clicks. Assisted anytime, anywhere. |

---

## Continuous read (for the booth)

> When something goes wrong on the road, you shouldn't have to work out who to call.
> Clicks puts roadside assistance in your pocket.
>
> One press alerts our support team — and sends them your exact location.
> Confirm your vehicle, or skip it and let the dispatcher sort the details.
> A dispatcher reviews the request and calls you before the timer runs out.
>
> Searching. In call. Assigned. Your technician is named before they set off, so you are never left guessing.
>
> Follow them in, with a live ETA. Watch them close the distance. Then they are at your car, and the work starts.
>
> When it is finished you pay the technician directly, the receipt is there in Qatari riyals,
> and the app asks how it went.
>
> Not an emergency? Book a battery change, a tyre, a full service or a wash — now, or scheduled for later.
>
> Your cars, your history, your receipts — all in one place.
>
> Clicks. Assisted anytime, anywhere.

---

## Notes for whoever records this

- **"you pay the technician directly"** is deliberate. There is no in-app payment in the customer app; the
  technician collects, and the app issues the receipt. Do not let this be reworded into "pay in the app".
- **"a dispatcher … calls you"** is what the app itself says on the SOS screen ("Our team is reviewing your
  request and will call you before the timer ends"). It is a promise the product already makes.
- **"Watch them close the distance" is literal.** The tracking map is real and so is the movement: the
  technician's position was driven along a route from West Bay to the customer through the production
  location API, and the map and ETA respond to it live. Nothing about the map is simulated.
- Numbers on screen — 150 QAR, job reference CLK-26-0147, the 5.0 rating — are from the real demo job that
  was run during filming, not dressed up.

---

## Swapping the voice

The film still reads with the sound off — every line is also an on-screen caption — so the voice is an
addition, not a crutch. To change it, regenerate the eight clips with a different voice id, drop them into
`public/vo/` under the same filenames and re-render; `TIMELINE` in `src/Video.jsx` holds each line's start
offset (`voAt`, in frames) if the timing needs nudging.
