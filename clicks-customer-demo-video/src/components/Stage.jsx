import { PHONE_W, STATUS_BAR_RATIO } from "../theme";

/**
 * Where the phone stands on the 1920x1080 stage, per chapter side.
 * Keeping these fixed means in-chapter cuts swap the screen without the
 * device itself moving, which reads as a cut inside the phone, not a jump.
 */
export const PHONE = {
  right: { left: 1322, top: 88, scale: 1 },
  left: { left: 214, top: 88, scale: 1 },
};

/**
 * Map a point in captured device space (1080x2400, status bar included) to
 * stage pixels, so a callout can be aimed at whatever the real screen shows.
 */
export const phonePoint = (side, devX, devY) => {
  const p = PHONE[side];
  const w = PHONE_W * p.scale;
  return {
    x: p.left + (devX / 1080) * w,
    y: p.top + (devY / 1080) * w - w * STATUS_BAR_RATIO,
  };
};

/** Left edge / right edge of the phone, for anchoring callout lines. */
export const phoneEdge = (side) => {
  const p = PHONE[side];
  return { left: p.left - 14, right: p.left + PHONE_W * p.scale + 14 };
};
