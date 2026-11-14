import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { PhoneFrame } from "../components/PhoneFrame";
import { Eyebrow, Headline } from "../components/Type";
import { Bug } from "../components/Caption";
import { C, font } from "../theme";
import { nameTag } from "../components/NameTag";

/**
 * Chapter G — what is waiting in the app between call-outs. 195f.
 * Three real screens arriving as a row, each with its own label.
 */
const Card = ({ src, label, delay, x, overlays = [] }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 200, mass: 0.8 }, durationInFrames: 28 });
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: 236,
        opacity: interpolate(s, [0, 1], [0, 1]),
        transform: `translateY(${interpolate(s, [0, 1], [48, 0])}px)`,
      }}
    >
      <PhoneFrame src={src} scale={0.63} enter={0} overlays={overlays} />
      <div
        style={{
          marginTop: 30,
          textAlign: "center",
          width: 430 * 0.63,
          fontFamily: font.family,
          fontWeight: 500,
          fontSize: 23,
          letterSpacing: ".04em",
          color: C.muted,
        }}
      >
        {label}
      </div>
    </div>
  );
};

export const ChEveryday = () => (
  <Backdrop side="right" intensity={0.75}>
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 96,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 22,
        }}
      >
        <Eyebrow delay={4}>Chapter 06 &middot; In one place</Eyebrow>
        <Headline lines={["Your cars. Your history. Your receipts."]} delay={12} size={52} />
      </div>

      <Card src="stills/s19-mycars.png" label="MY CARS" delay={16} x={410} />
      <Card src="stills/s20-activity.png" label="EVERY JOB, ON RECORD" delay={30} x={824} />
      <Card
        src="stills/s17-details.png"
        label="WHAT WAS DONE, AND BY WHOM"
        delay={44}
        x={1238}
        overlays={[nameTag("details")]}
      />

      <Bug />
    </AbsoluteFill>
  </Backdrop>
);
