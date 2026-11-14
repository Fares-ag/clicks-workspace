import React from "react";
import { Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { C, font } from "../theme";

/**
 * The narration line, on screen. The film is built to read with the sound off —
 * this is the same sentence the voice-over script carries for that beat.
 */
export const Caption = ({ children, delay = 0, hold = 9999, align = "left", x = 120, bottom = 128 }) => {
  const frame = useCurrentFrame();
  const t = frame - delay;
  const inOp = interpolate(t, [0, 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const outOp = interpolate(t, [hold, hold + 12], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const y = interpolate(t, [0, 16], [16, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <div
      style={{
        position: "absolute",
        left: align === "center" ? 0 : x,
        right: align === "center" ? 0 : undefined,
        bottom,
        textAlign: align,
        opacity: Math.min(inOp, outOp),
        transform: `translateY(${y}px)`,
        maxWidth: align === "center" ? undefined : 900,
        fontFamily: font.family,
        fontWeight: 300,
        fontSize: 32,
        lineHeight: 1.4,
        color: "rgba(255,255,255,.88)",
      }}
    >
      {children}
    </div>
  );
};

/** Small persistent brand mark, bottom-left of every chapter. */
export const Bug = () => (
  <div
    style={{
      position: "absolute",
      left: 120,
      bottom: 56,
      display: "flex",
      alignItems: "center",
      gap: 20,
      fontFamily: font.family,
      fontWeight: 300,
      fontSize: 17,
      letterSpacing: ".06em",
      color: C.faint,
    }}
  >
    <Img src={staticFile("brand/Logo-white.svg")} style={{ height: 26, opacity: 0.75 }} />
    <span>clicks.qa</span>
  </div>
);
