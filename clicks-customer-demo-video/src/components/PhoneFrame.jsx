import React from "react";
import { Img, OffthreadVideo, staticFile, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { PHONE_W, PHONE_H, STATUS_BAR_RATIO } from "../theme";

/**
 * One patch inside the screen: a chip in the row's own background colour with
 * replacement text on top. Device pixels in, screen pixels out — `k` is the
 * scale from the 1080-wide capture to this phone's screen width.
 */
const ScreenPatch = ({ o, w, frame }) => {
  const k = w / 1080;
  const on = frame >= (o.delay ?? 0);
  if (!on) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: (o.x - (o.pad ?? 0)) * k,
        top: (o.y - 128 - (o.pad ?? 0)) * k,
        width: (o.w + (o.pad ?? 0) * 2) * k,
        height: (o.h + (o.pad ?? 0) * 2) * k,
        background: o.bg,
        overflow: o.clip ? "hidden" : "visible",
        display: "flex",
        alignItems: "center",
        justifyContent: o.align === "center" ? "center" : "flex-start",
      }}
    >
      <span
        style={{
          fontFamily: o.fontFamily,
          fontWeight: o.weight,
          fontSize: o.size * k,
          lineHeight: 1,
          color: o.color,
          whiteSpace: "nowrap",
          paddingLeft: o.align === "center" ? 0 : (o.pad ?? 0) * k,
        }}
      >
        {o.text}
      </span>
    </div>
  );
};

/**
 * A phone standing on the stage with a real captured screen inside it.
 *
 * The capture is 1080x2400 including a 128px Android status bar. We crop that
 * off and let this chrome stand in for it, which keeps every shot starting at
 * app content and hides the emulator's punch-hole cutout. No product UI is cut.
 *
 * `src` is a path under public/ — either a still (1080x2400) or a take
 * (468x1040, same aspect, so the same crop maths applies).
 */
export const PhoneFrame = ({
  src,
  video = false,
  startFrom = 0,
  playbackRate = 1,
  scale = 1,
  rotate = 0,
  /** Slow push on stills so they are never dead still. */
  ken = 0,
  /** Rises into place over this many frames; 0 disables. */
  enter = 22,
  muted = true,
  /**
   * Patches drawn inside the screen, in device pixels — see NameTag.jsx.
   * Only used to swap the demo technician's name for the film's persona.
   */
  overlays = [],
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const rise = enter
    ? spring({ frame, fps, config: { damping: 200, mass: 0.7 }, durationInFrames: enter })
    : 1;
  const y = interpolate(rise, [0, 1], [34, 0]);
  const op = interpolate(rise, [0, 1], [0, 1]);
  const kenScale = ken ? 1 + (frame / 300) * ken : 1;

  const w = PHONE_W * scale;
  const h = PHONE_H * scale;
  const inner = {
    width: "100%",
    display: "block",
    // Pull the status bar off the top: the source is `w` wide, so its own
    // status bar is w * 128/1080 tall once fitted.
    marginTop: -w * STATUS_BAR_RATIO,
    transform: `scale(${kenScale})`,
    transformOrigin: "50% 30%",
  };

  return (
    <div
      style={{
        position: "relative",
        width: w,
        height: h,
        borderRadius: 46 * scale,
        background: "#000",
        opacity: op,
        transform: `translateY(${y}px) rotate(${rotate}deg)`,
        boxShadow: `0 60px 120px rgba(0,0,0,.65), 0 0 0 ${9 * scale}px #1b1c1f, 0 0 0 ${10 * scale}px rgba(255,255,255,.09)`,
        ...style,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 40 * scale,
          overflow: "hidden",
          background: "#fff",
        }}
      >
        {video ? (
          <OffthreadVideo
            src={staticFile(src)}
            startFrom={startFrom}
            playbackRate={playbackRate}
            muted={muted}
            style={inner}
          />
        ) : (
          <Img src={staticFile(src)} style={inner} />
        )}
        {overlays.map((o, i) => (
          <ScreenPatch key={`${o.x}-${o.y}-${i}`} o={o} w={w} frame={frame} />
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 46 * scale,
          background:
            "linear-gradient(145deg, rgba(255,255,255,.14), transparent 28%, transparent 72%, rgba(255,255,255,.07))",
          pointerEvents: "none",
        }}
      />
    </div>
  );
};
