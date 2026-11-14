import React from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { GRAIN, font } from "../theme";

export const EndCard = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const mark = spring({ frame: frame - 6, fps, config: { damping: 200, mass: 0.8 }, durationInFrames: 30 });
  const hair = interpolate(frame - 30, [0, 18], [0, 260], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const line = spring({ frame: frame - 38, fps, config: { damping: 200, mass: 0.7 }, durationInFrames: 26 });
  const site = spring({ frame: frame - 56, fps, config: { damping: 200, mass: 0.7 }, durationInFrames: 26 });
  const breathe = 1 + Math.sin(frame / 90) * 0.012;

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(${1400 * breathe}px ${900 * breathe}px at 50% 42%, #A82323 0%, #6B1414 38%, #230707 72%, #0C0D0F 100%)`,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 40, textAlign: "center" }}>
        <Img
          src={staticFile("brand/Logo-white.svg")}
          style={{
            height: 86,
            opacity: interpolate(mark, [0, 1], [0, 1]),
            transform: `translateY(${interpolate(mark, [0, 1], [22, 0])}px)`,
          }}
        />
        <div style={{ width: hair, height: 1, background: "rgba(255,255,255,.26)" }} />
        <div
          style={{
            fontFamily: font.family,
            fontWeight: 300,
            fontSize: 46,
            color: "rgba(255,255,255,.93)",
            opacity: interpolate(line, [0, 1], [0, 1]),
            transform: `translateY(${interpolate(line, [0, 1], [14, 0])}px)`,
          }}
        >
          Assisted anytime, anywhere.
        </div>
        <div
          style={{
            fontFamily: font.family,
            fontWeight: 500,
            fontSize: 25,
            letterSpacing: ".3em",
            color: "rgba(255,255,255,.72)",
            opacity: interpolate(site, [0, 1], [0, 1]),
          }}
        >
          CLICKS.QA
        </div>
      </div>
      <AbsoluteFill style={{ backgroundImage: GRAIN, opacity: 0.045 }} />
    </AbsoluteFill>
  );
};
