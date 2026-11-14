import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C, GRAIN } from "../theme";

/**
 * The stage every scene sits on: near-black with a slow crimson bloom that
 * drifts across the chapter so static screens never feel frozen.
 *
 * `side` puts the bloom behind wherever the phone is standing.
 */
export const Backdrop = ({ side = "right", intensity = 1, children }) => {
  const frame = useCurrentFrame();
  const drift = interpolate(frame, [0, 600], [0, 1], {
    extrapolateRight: "clamp",
  });
  const x = side === "right" ? 74 + drift * 4 : 24 - drift * 4;
  const y = 48 + Math.sin(frame / 160) * 5;

  return (
    <AbsoluteFill style={{ background: C.ink900, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          background: [
            `radial-gradient(760px 760px at ${x}% ${y}%, rgba(192,40,40,${0.5 * intensity}), transparent 66%)`,
            `radial-gradient(1300px 900px at ${x + 5}% ${y - 3}%, rgba(152,31,31,${0.4 * intensity}), transparent 64%)`,
            `radial-gradient(900px 620px at ${side === "right" ? 6 : 94}% 4%, rgba(152,31,31,.18), transparent 62%)`,
            C.ink900,
          ].join(","),
        }}
      />
      {children}
      <AbsoluteFill
        style={{ backgroundImage: GRAIN, opacity: 0.045, pointerEvents: "none" }}
      />
    </AbsoluteFill>
  );
};
