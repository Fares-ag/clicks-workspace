import React from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, GRAIN, font } from "../theme";

/** Opening card: the mark arrives out of a crimson bloom, then the line lands. */
export const LogoReveal = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const bloom = spring({ frame, fps, config: { damping: 200, mass: 1.4 }, durationInFrames: 60 });
  const mark = spring({ frame: frame - 14, fps, config: { damping: 200, mass: 0.8 }, durationInFrames: 30 });
  const hair = interpolate(frame - 48, [0, 20], [0, 300], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const line = spring({ frame: frame - 58, fps, config: { damping: 200, mass: 0.7 }, durationInFrames: 26 });
  const out = interpolate(frame, [durationInFrames - 22, durationInFrames - 2], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ background: "#000", opacity: out }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(${600 + bloom * 900}px ${420 + bloom * 560}px at 50% 46%, #A82323 0%, #6B1414 36%, #230707 70%, #0C0D0F 100%)`,
          opacity: interpolate(bloom, [0, 0.35], [0, 1], { extrapolateRight: "clamp" }),
        }}
      />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 38 }}>
          <Img
            src={staticFile("brand/Logo-white.svg")}
            style={{
              height: 92,
              opacity: interpolate(mark, [0, 1], [0, 1]),
              transform: `translateY(${interpolate(mark, [0, 1], [26, 0])}px) scale(${interpolate(mark, [0, 1], [0.94, 1])})`,
            }}
          />
          <div style={{ width: hair, height: 1, background: "rgba(255,255,255,.3)" }} />
          <div
            style={{
              fontFamily: font.family,
              fontWeight: 300,
              fontSize: 46,
              color: "rgba(255,255,255,.93)",
              opacity: interpolate(line, [0, 1], [0, 1]),
              transform: `translateY(${interpolate(line, [0, 1], [16, 0])}px)`,
            }}
          >
            Assisted anytime, anywhere.
          </div>
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ backgroundImage: GRAIN, opacity: 0.045 }} />
    </AbsoluteFill>
  );
};
