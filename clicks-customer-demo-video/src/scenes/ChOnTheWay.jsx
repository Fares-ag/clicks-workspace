import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { PhoneFrame } from "../components/PhoneFrame";
import { PHONE, phonePoint } from "../components/Stage";
import { Callout } from "../components/Callout";
import { Eyebrow, Headline, Rule } from "../components/Type";
import { Bug, Caption } from "../components/Caption";
import { nameTag } from "../components/NameTag";

/**
 * Chapter D — on the way. 390f.
 *
 * The real tracking map, zoomed out to hold both the technician and the
 * customer, with the technician closing the distance and the ETA counting
 * down from seven minutes. The drive is run at 3x so the whole approach fits
 * the beat; everything on screen is live product state.
 */
export const ChOnTheWay = () => {
  const p = PHONE.right;
  const at = { position: "absolute", left: p.left, top: p.top };
  const eta = phonePoint("right", 880, 1515); // the ETA pill
  const route = phonePoint("right", 300, 900); // over the drawn route
  const banner = phonePoint("right", 120, 310); // "Technician has arrived!"

  return (
    <Backdrop side="right">
      <AbsoluteFill>
        <div style={{ position: "absolute", left: 120, top: 268, display: "flex", flexDirection: "column", gap: 30 }}>
          <Eyebrow delay={6}>Chapter 03 &middot; On the way</Eyebrow>
          <Headline lines={["Follow it", "all the way in."]} delay={14} size={74} accentFrom={1} />
          <Rule delay={34} />
        </div>

        {/* The drive: both markers on screen, distance closing, ETA falling. */}
        <Sequence durationInFrames={240}>
          <div style={at}>
            <PhoneFrame
              video
              src="clips/take15-tracking-map.mp4"
              startFrom={120}
              playbackRate={3.25}
              overlays={[nameTag("enroute")]}
            />
          </div>
          <Callout x={route.x} y={route.y} label="Watch them close the distance" dir="left" length={190} delay={24} />
          <Callout x={eta.x} y={eta.y} label="Live ETA" dir="left" length={210} delay={110} />
          <Caption x={120} bottom={150} delay={20} hold={190}>
            You can see exactly where your technician is, and how long they will be.
          </Caption>
        </Sequence>

        <Sequence from={240} durationInFrames={75}>
          <div style={at}>
            <PhoneFrame
              video
              src="clips/take15-tracking-map.mp4"
              startFrom={1290}
              enter={0}
              overlays={[nameTag("arrived")]}
            />
          </div>
          <Callout x={banner.x} y={banner.y} label="Arrived" dir="left" length={200} delay={8} />
          <Caption x={120} bottom={150} delay={6}>
            Then they are at your car.
          </Caption>
        </Sequence>

        <Sequence from={315}>
          <div style={at}>
            <PhoneFrame
              video
              src="clips/take16-inprogress-complete.mp4"
              startFrom={180}
              enter={0}
              overlays={[nameTag("inProgress")]}
            />
          </div>
          <Caption x={120} bottom={150} delay={8}>
            Work starts, and the job card tells you exactly what is happening.
          </Caption>
        </Sequence>

        <Bug />
      </AbsoluteFill>
    </Backdrop>
  );
};
