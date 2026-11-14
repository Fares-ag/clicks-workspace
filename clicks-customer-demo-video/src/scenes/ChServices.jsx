import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { PhoneFrame } from "../components/PhoneFrame";
import { PHONE, phonePoint } from "../components/Stage";
import { Callout } from "../components/Callout";
import { Eyebrow, Headline } from "../components/Type";
import { Bug, Caption } from "../components/Caption";

/**
 * Chapter F — not every call-out is an emergency. 285f.
 * The real service catalogue, the real Now / Schedule choice, and the real
 * date and time pickers. Callouts sit low on the phone so they stay clear of
 * the headline block.
 */
export const ChServices = () => {
  const p = PHONE.left;
  const at = { position: "absolute", left: p.left, top: p.top };
  const card = phonePoint("left", 940, 1180); // a service card mid-grid
  const timing = phonePoint("left", 940, 1580); // the Now / Schedule row

  return (
    <Backdrop side="left">
      <AbsoluteFill>
        <div style={{ position: "absolute", left: 830, top: 170, display: "flex", flexDirection: "column", gap: 28 }}>
          <Eyebrow delay={6}>Chapter 05 &middot; Everything else</Eyebrow>
          <Headline lines={["Not an", "emergency?"]} delay={14} size={70} accentFrom={1} />
        </div>

        <Sequence durationInFrames={135}>
          <div style={at}>
            <PhoneFrame video src="clips/take11-services.mp4" startFrom={30} playbackRate={1.8} />
          </div>
          <Callout x={card.x} y={card.y} label="Pick what you need" dir="right" length={150} delay={58} />
          <Caption x={830} bottom={150} delay={26}>
            Battery, oil, tyres, a full service or a wash &mdash; booked from the same app.
          </Caption>
        </Sequence>

        <Sequence from={135} durationInFrames={75}>
          <div style={at}>
            <PhoneFrame video src="clips/take11-services.mp4" startFrom={450} enter={0} />
          </div>
          <Callout x={timing.x} y={timing.y} label="Now, or scheduled" dir="right" length={150} delay={10} />
          <Caption x={830} bottom={150} delay={6}>
            Confirm the car, and say when you need it.
          </Caption>
        </Sequence>

        <Sequence from={210}>
          <div style={at}>
            <PhoneFrame video src="clips/take12-schedule.mp4" startFrom={60} playbackRate={1.9} enter={0} />
          </div>
          <Caption x={830} bottom={150} delay={6}>
            Choose the day and the hour that suits you.
          </Caption>
        </Sequence>

        <Bug />
      </AbsoluteFill>
    </Backdrop>
  );
};
