import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { PhoneFrame } from "../components/PhoneFrame";
import { PHONE, phonePoint } from "../components/Stage";
import { Callout } from "../components/Callout";
import { Eyebrow, Headline } from "../components/Type";
import { Bug, Caption } from "../components/Caption";

/**
 * Chapter B — raising an SOS. 480f.
 *
 * One continuous take (take13) slowed to fit the chapter, so the phone never
 * cuts: press, confirm the vehicle, and the real countdown while dispatch
 * picks it up. Callouts are aimed at device coordinates measured off the
 * capture, so they land on the thing they name.
 */
const SRC_IN = 1; // seconds into the take
const SRC_OUT = 24;
const DUR = 480;
const RATE = (SRC_OUT - SRC_IN) / (DUR / 30);

/** Chapter frame at which a given second of the source take is on screen. */
const atSource = (sec) => Math.round(((sec - SRC_IN) / RATE) * 30);

export const ChSOS = () => {
  const p = PHONE.left;
  const sosBtn = phonePoint("left", 760, 1335); // right edge of the SOS circle
  const vehicle = phonePoint("left", 860, 1831); // the vehicle card
  const ring = phonePoint("left", 790, 1290); // the countdown ring

  return (
    <Backdrop side="left">
      <AbsoluteFill>
        <div style={{ position: "absolute", left: 830, top: 170, display: "flex", flexDirection: "column", gap: 28 }}>
          <Eyebrow delay={8}>Chapter 01 &middot; The emergency</Eyebrow>
          <Headline lines={["Press once.", "Help starts moving."]} delay={16} size={70} accentFrom={1} />
        </div>

        <div style={{ position: "absolute", left: p.left, top: p.top }}>
          <PhoneFrame video src="clips/take13-sos-clean.mp4" startFrom={SRC_IN * 30} playbackRate={RATE} />
        </div>

        <Sequence from={atSource(2.2)} durationInFrames={atSource(5.5) - atSource(2.2)}>
          <Callout x={sosBtn.x} y={sosBtn.y} label="One press of SOS" dir="right" length={170} />
        </Sequence>
        <Sequence from={atSource(6)} durationInFrames={atSource(11) - atSource(6)}>
          <Callout x={vehicle.x} y={vehicle.y} label="Confirm your vehicle, or skip it" dir="right" length={150} />
        </Sequence>
        <Sequence from={atSource(16)} durationInFrames={atSource(SRC_OUT) - atSource(16)}>
          <Callout x={ring.x} y={ring.y} label="Dispatch is already on it" dir="right" length={170} />
        </Sequence>

        <Sequence durationInFrames={atSource(10)}>
          <Caption x={830} bottom={150} hold={atSource(10) - 34}>
            One press alerts our support team &mdash; and sends them your exact location.
          </Caption>
        </Sequence>
        <Sequence from={atSource(10)}>
          <Caption x={830} bottom={150} delay={6}>
            A dispatcher reviews it and calls you before the timer runs out.
          </Caption>
        </Sequence>

        <Bug />
      </AbsoluteFill>
    </Backdrop>
  );
};
