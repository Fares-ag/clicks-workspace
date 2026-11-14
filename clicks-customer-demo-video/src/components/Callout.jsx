import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, font } from "../theme";

/**
 * A label joined to a point on the phone by a line that draws itself out.
 * Positioned in stage coordinates (1920x1080) so it can be aimed at whatever
 * the real screen is showing at that moment.
 *
 * `dir` is which way the line runs away from the anchor.
 */
export const Callout = ({
  x,
  y,
  label,
  dir = "right",
  length = 200,
  delay = 0,
  color = C.accent,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const draw = spring({
    frame: frame - delay,
    fps,
    config: { damping: 200, mass: 0.5 },
    durationInFrames: 22,
  });
  const len = interpolate(draw, [0, 1], [0, length]);
  const textOp = interpolate(frame - delay, [12, 26], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const right = dir === "right";

  return (
    <div style={{ position: "absolute", left: x, top: y }}>
      <div
        style={{
          position: "absolute",
          left: right ? 0 : -len,
          top: -1,
          width: len,
          height: 2,
          background: right
            ? `linear-gradient(90deg, ${color}, ${color}00)`
            : `linear-gradient(90deg, ${color}00, ${color})`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: -5,
          top: -5,
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: color,
          opacity: interpolate(draw, [0, 0.2], [0, 1], { extrapolateRight: "clamp" }),
          boxShadow: `0 0 0 6px ${color}22`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: right ? length - 4 : undefined,
          right: right ? undefined : length - 4,
          top: -42,
          whiteSpace: "nowrap",
          opacity: textOp,
          fontFamily: font.family,
          fontWeight: 500,
          fontSize: 22,
          letterSpacing: ".04em",
          color,
        }}
      >
        {label}
      </div>
    </div>
  );
};

/** A soft ring that draws attention to a region of the screen. */
export const Spot = ({ x, y, w, h, delay = 0, color = C.accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({
    frame: frame - delay,
    fps,
    config: { damping: 200, mass: 0.6 },
    durationInFrames: 24,
  });
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        height: h,
        borderRadius: 18,
        border: `2px solid ${color}`,
        opacity: interpolate(s, [0, 1], [0, 0.85]),
        transform: `scale(${interpolate(s, [0, 1], [1.07, 1])})`,
        boxShadow: `0 0 0 100vmax rgba(10,11,13,${interpolate(s, [0, 1], [0, 0.0])})`,
      }}
    />
  );
};
