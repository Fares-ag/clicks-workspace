import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { PhoneFrame } from "../components/PhoneFrame";
import { PHONE, phonePoint } from "../components/Stage";
import { Callout } from "../components/Callout";
import { Eyebrow, Headline } from "../components/Type";
import { Bug, Caption } from "../components/Caption";
import { C, font } from "../theme";
import { nameTag } from "../components/NameTag";

/**
 * Chapter C — the wait. 270f.
 * take02 runs continuously from the dispatcher call through to the moment the
 * technician is named, and the step list lights up in time with the screen.
 */
const SRC_IN = 3;
const SRC_OUT = 20;
const DUR = 270;
const RATE = (SRC_OUT - SRC_IN) / (DUR / 30);
const atSource = (sec) => Math.round(((sec - SRC_IN) / RATE) * 30);

const Step = ({ label, detail, delay, live }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 200, mass: 0.6 }, durationInFrames: 20 });
  const lit = interpolate(s, [0, 1], [0.28, 1]);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 20,
        fontFamily: font.family,
        fontSize: 24,
        fontWeight: 300,
        color: `rgba(255,255,255,${0.3 + lit * 0.55})`,
        transform: `translateX(${interpolate(s, [0, 1], [14, 0])}px)`,
      }}
    >
      <span
        style={{
          width: 13,
          height: 13,
          borderRadius: "50%",
          flex: "none",
          background: live ? C.accent : C.crimson,
          opacity: lit,
          boxShadow: `0 0 0 7px ${live ? "rgba(255,255,255,.22)" : "rgba(152,31,31,.22)"}`,
        }}
      />
      <span>
        <b style={{ fontWeight: 500, color: `rgba(255,255,255,${lit})` }}>{label}</b> &mdash; {detail}
      </span>
    </div>
  );
};

export const ChWait = () => {
  const p = PHONE.left;
  const banner = phonePoint("left", 880, 350); // the green "Technician Assigned" card

  return (
    <Backdrop side="left">
      <AbsoluteFill>
        <div style={{ position: "absolute", left: 830, top: 300, display: "flex", flexDirection: "column", gap: 28 }}>
          <Eyebrow delay={6}>Chapter 02 &middot; The wait</Eyebrow>
          <Headline lines={["You are never", "left guessing."]} delay={14} size={70} />
          <div style={{ display: "flex", flexDirection: "column", gap: 19, marginTop: 8 }}>
            <Step label="Searching" detail="your request goes out to dispatch" delay={40} />
            <Step label="In call" detail="a dispatcher picks it up" delay={62} />
            <Step label="Assigned" detail="your technician is named" delay={atSource(7)} live />
          </div>
        </div>

        <div style={{ position: "absolute", left: p.left, top: p.top }}>
          <PhoneFrame
            video
            src="clips/take02-assigned.mp4"
            startFrom={SRC_IN * 30}
            playbackRate={RATE}
            overlays={[nameTag("assigned", { delay: atSource(5.45) })]}
          />
        </div>

        <Callout
          x={banner.x}
          y={banner.y}
          label="Named, before they set off"
          dir="right"
          length={150}
          delay={atSource(8)}
        />

        <Caption x={830} bottom={120} delay={atSource(12)}>
          Dispatch calls to confirm &mdash; so you know who is coming.
        </Caption>
        <Bug />
      </AbsoluteFill>
    </Backdrop>
  );
};
