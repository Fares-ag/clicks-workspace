/**
 * Brand tokens, read straight off the product:
 *   clicks-user/lib/core/theme/colors_manager.dart
 *   clicks-user/assets/fonts (Helvetica Neue, the app's own typeface)
 * Nothing here is invented — if a value is not in the product, it is not used.
 */
export const C = {
  crimson: "#981F1F",
  crimsonLit: "#C02828",
  crimsonSoft: "#FF6B6B",
  ink: "#17181A",
  ink900: "#0C0D0F",
  /** Annotation accent. White reads as part of the film, not as a second brand colour. */
  accent: "#FFFFFF",
  accentSoft: "rgba(255,255,255,.80)",
  white: "#FFFFFF",
  muted: "rgba(255,255,255,.62)",
  faint: "rgba(255,255,255,.40)",
};

export const FPS = 30;
export const W = 1920;
export const H = 1080;

/** The capture is 1080x2400 with a 128px OS status bar we never show. */
export const STATUS_BAR_RATIO = 128 / 1080; // of the screen WIDTH, since we fit by width
export const PHONE_W = 430;
export const PHONE_H = 905; // 430 * (2400-128) / 1080, rounded

export const font = {
  family: "HelveticaNeue, 'Helvetica Neue', Arial, sans-serif",
};

/** Procedural film grain, so the flat gradients do not band on compression. */
export const GRAIN =
  "url(\"data:image/svg+xml;utf8," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'>" +
      "<filter id='n'><feTurbulence baseFrequency='.9' numOctaves='3'/></filter>" +
      "<rect width='140' height='140' filter='url(#n)'/></svg>"
  ) +
  "\")";
