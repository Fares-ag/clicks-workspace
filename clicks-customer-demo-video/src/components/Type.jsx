import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, font } from "../theme";

/** Shared rise-and-fade used by every text element, staggered by `delay`. */
const useRise = (delay = 0, distance = 26) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({
    frame: frame - delay,
    fps,
    config: { damping: 200, mass: 0.6 },
    durationInFrames: 20,
  });
  return {
    opacity: interpolate(s, [0, 1], [0, 1]),
    transform: `translateY(${interpolate(s, [0, 1], [distance, 0])}px)`,
  };
};

export const Eyebrow = ({ children, delay = 0, color = C.accentSoft }) => (
  <div
    style={{
      ...useRise(delay, 14),
      fontFamily: font.family,
      fontWeight: 500,
      fontSize: 19,
      letterSpacing: ".34em",
      textTransform: "uppercase",
      color,
    }}
  >
    {children}
  </div>
);

const HeadlineLine = ({ children, delay, accent }) => (
  <div style={{ ...useRise(delay, 30), color: accent ? C.crimsonSoft : C.white }}>{children}</div>
);

export const Headline = ({ lines, delay = 0, size = 88, accentFrom = 99 }) => (
  <div style={{ fontFamily: font.family, fontWeight: 700, fontSize: size, lineHeight: 0.99, letterSpacing: "-.025em" }}>
    {lines.map((line, i) => (
      <HeadlineLine key={line} delay={delay + i * 5} accent={i >= accentFrom}>
        {line}
      </HeadlineLine>
    ))}
  </div>
);

export const Rule = ({ delay = 0, width = 92 }) => {
  const frame = useCurrentFrame();
  const w = interpolate(frame - delay, [0, 18], [0, width], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return <div style={{ width: w, height: 5, borderRadius: 3, background: C.crimson }} />;
};

export const Sub = ({ children, delay = 0, width = 620, size = 29 }) => (
  <div
    style={{
      ...useRise(delay, 20),
      fontFamily: font.family,
      fontWeight: 300,
      fontSize: size,
      lineHeight: 1.45,
      color: C.muted,
      maxWidth: width,
    }}
  >
    {children}
  </div>
);
