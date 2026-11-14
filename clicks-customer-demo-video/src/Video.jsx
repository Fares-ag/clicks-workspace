import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { LogoReveal } from "./scenes/LogoReveal";
import { ChLogin } from "./scenes/ChLogin";
import { ChSOS } from "./scenes/ChSOS";
import { ChWait } from "./scenes/ChWait";
import { ChOnTheWay } from "./scenes/ChOnTheWay";
import { ChDone } from "./scenes/ChDone";
import { ChServices } from "./scenes/ChServices";
import { ChEveryday } from "./scenes/ChEveryday";
import { EndCard } from "./scenes/EndCard";

/**
 * The cut. Edit these numbers and the whole film re-times; every scene reads
 * its own length from the Sequence it sits in.
 */
/** Narration clip lengths in frames, measured off public/vo after polishing. */
const VO_LEN = {
  "vo/02-login.mp3": 204,
  "vo/03-sos.mp3": 428,
  "vo/04-wait.mp3": 205,
  "vo/05a-follow.mp3": 72,
  "vo/05b-distance.mp3": 53,
  "vo/05c-arrive.mp3": 77,
  "vo/06a-pay.mp3": 76,
  "vo/06b-receipt.mp3": 142,
  "vo/07-services.mp3": 213,
  "vo/08-everyday.mp3": 127,
  "vo/09-end.mp3": 109,
};

export const TIMELINE = [
  { id: "logo", dur: 126, Scene: LogoReveal, vo: [] },
  { id: "login", dur: 255, Scene: ChLogin, vo: [["vo/02-login.mp3", 18]] },
  { id: "sos", dur: 480, Scene: ChSOS, vo: [["vo/03-sos.mp3", 20]] },
  { id: "wait", dur: 270, Scene: ChWait, vo: [["vo/04-wait.mp3", 18]] },
  {
    id: "ontheway",
    dur: 390,
    Scene: ChOnTheWay,
    // Split at its own sentence breaks so the line tracks the drive instead of
    // finishing early and leaving the map to play out in silence.
    vo: [["vo/05a-follow.mp3", 20], ["vo/05b-distance.mp3", 118], ["vo/05c-arrive.mp3", 246]],
  },
  { id: "done", dur: 315, Scene: ChDone, vo: [["vo/06a-pay.mp3", 18], ["vo/06b-receipt.mp3", 140]] },
  { id: "services", dur: 285, Scene: ChServices, vo: [["vo/07-services.mp3", 18]] },
  { id: "everyday", dur: 195, Scene: ChEveryday, vo: [["vo/08-everyday.mp3", 18]] },
  { id: "end", dur: 180, Scene: EndCard, vo: [["vo/09-end.mp3", 24]] },
];

export const TOTAL = TIMELINE.reduce((n, s) => n + s.dur, 0);

/** Frame each chapter starts on, keyed by id — used by the preview composition. */
export const MARKS = TIMELINE.reduce(
  (acc, s) => {
    acc.marks[s.id] = acc.at;
    acc.at += s.dur;
    return acc;
  },
  { marks: {}, at: 0 }
).marks;

/** Absolute frame windows where narration is playing, for the music duck. */
export const SPEECH = (() => {
  const out = [];
  let at = 0;
  for (const c of TIMELINE) {
    for (const [src, voAt] of c.vo) out.push([at + voAt, at + voAt + (VO_LEN[src] ?? 0)]);
    at += c.dur;
  }
  return out;
})();

const FADE = 9;
const DUCK_RAMP = 14;

/**
 * Music bed. Quiet under the voice, a little fuller in the gaps, and fullest
 * over the logo and the end card where there is no voice at all.
 */
const MusicBed = () => {
  const volume = (f) => {
    let near = Infinity;
    for (const [a, b] of SPEECH) {
      if (f >= a && f <= b) return 0.1;
      near = Math.min(near, f < a ? a - f : f - b);
    }
    const open = interpolate(near, [0, DUCK_RAMP], [0.1, 0.26], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    // Let it breathe over the two cards that carry no narration.
    const card = f < 110 || f > TOTAL - 150 ? 1.35 : 1;
    const tail = interpolate(f, [TOTAL - 45, TOTAL - 2], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    return open * card * tail;
  };
  return <Audio src={staticFile("music/bed.wav")} volume={volume} loop />;
};

/** Chapters butt up against each other; a short dip keeps the joins soft. */
const Chapter = ({ dur, children }) => {
  const frame = useCurrentFrame();
  const opacity = Math.min(
    interpolate(frame, [0, FADE], [0, 1], { extrapolateRight: "clamp" }),
    interpolate(frame, [dur - FADE, dur], [1, 0], { extrapolateLeft: "clamp" })
  );
  return <AbsoluteFill style={{ opacity, background: "#0C0D0F" }}>{children}</AbsoluteFill>;
};

export const ClicksDemo = () => {
  let at = 0;
  return (
    <AbsoluteFill style={{ background: "#0C0D0F" }}>
      <MusicBed />
      {TIMELINE.map(({ id, dur, Scene, vo }) => {
        const from = at;
        at += dur;
        return (
          <Sequence key={id} from={from} durationInFrames={dur} name={id}>
            <Chapter dur={dur}>
              <Scene durationInFrames={dur} />
            </Chapter>
            {/* Narration sits outside the Chapter fade so the voice is not
                ducked by the crossfade at each chapter join. */}
            {vo.map(([src, voAt]) => (
              <Sequence key={src} from={voAt} name={src.split("/")[1]}>
                <Audio src={staticFile(src)} />
              </Sequence>
            ))}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
