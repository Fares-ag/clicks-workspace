import { font } from "../theme";

/**
 * The technician's name as shown to the customer.
 *
 * The filmed job was dispatched to the seeded demo technician, whose record
 * reads "Omar Al-Thani". The persona for this film is Mohammed Khalil, so each
 * place the app prints the name is patched in the edit: a chip in the row's own
 * background colour, with the name redrawn in the app's own typeface.
 *
 * This only swaps one fictional demo persona for another — no screen, control,
 * number or capability is altered. Every box below was measured off the capture
 * with tools/measure-name.mjs, in device pixels (1080x2400), so the patch lands
 * exactly on the text it replaces.
 */
export const TECH_NAME = "Mohammed Khalil";

/**
 * x/y/w/h and `size` are device pixels; PhoneFrame maps them into the screen.
 * `pad` widens the chip beyond the measured ink so antialiased edges are covered.
 */
export const NAME_SPOTS = {
  /** Green "Technician Assigned" card — take02 / s09. */
  assigned: {
    x: 148, y: 524, w: 300, h: 36,
    size: 45, weight: 500, color: "#C6D4C9", bg: "#07431F", pad: 6,
  },
  /** Tracking sheet while en route — take03 / s14. */
  enroute: {
    x: 309, y: 1649, w: 300, h: 34,
    size: 43, weight: 500, color: "#1B2232", bg: "#FFFFFF", pad: 6,
  },
  /** Tracking sheet after arrival — take03 / s15. */
  arrived: {
    x: 309, y: 1628, w: 300, h: 34,
    size: 43, weight: 500, color: "#1B2232", bg: "#FFFFFF", pad: 6,
  },
  /** "Job is in Progress" card — take04 / s16. */
  inProgress: {
    x: 152, y: 1074, w: 260, h: 31,
    size: 37, weight: 500, color: "#1B2232", bg: "#F4F5F8", pad: 5,
  },
  /** Rating sheet, centred second line — take05 / s18. */
  rating: {
    x: 170, y: 1492, w: 740, h: 46,
    size: 56, weight: 700, color: "#17181A", bg: "#FFFFFF", pad: 4, align: "center",
  },
  /** Activity details technician row — s17-details. */
  details: {
    x: 124, y: 889, w: 272, h: 37,
    size: 40, weight: 500, color: "#1B2232", bg: "#FFFFFF", pad: 4,
  },
  /** In-progress card seen through the thank-you modal's scrim — take17. */
  inProgressDimmed: {
    x: 152, y: 1074, w: 248, h: 31,
    size: 37, weight: 500, color: "#3F4044", bg: "#707070", pad: 5,
  },
  /**
   * Same row behind the receipt dialog — s17-receipt. The dialog clips the name
   * after a couple of letters, and the scrim darkens what is left, so the chip
   * is the dimmed background colour and the text is cut to what actually shows.
   */
  detailsDimmed: {
    x: 122, y: 888, w: 70, h: 40,
    size: 40, weight: 500, color: "#3A3C44", bg: "#757575", pad: 0, clip: true,
  },
};

/** Build the overlay descriptor PhoneFrame renders inside the screen. */
export const nameTag = (spot, { text = TECH_NAME, delay = 0 } = {}) => ({
  ...NAME_SPOTS[spot],
  text,
  delay,
  fontFamily: font.family,
});

