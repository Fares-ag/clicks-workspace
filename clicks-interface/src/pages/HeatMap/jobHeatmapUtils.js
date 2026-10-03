import { HEATMAP_JOB_TYPES } from "../../constants/jobTypes";
import { getJobStatusHeatmapOptions } from "../../utils/jobStatusLabels";

/** Qatar map defaults — same as Live Map */

export const MAP_CENTER = { lat: 25.276987, lng: 51.520008 };

export const MAP_ZOOM = 11;



export const JOB_STATUSES = getJobStatusHeatmapOptions();



export const JOB_TYPES = [

  { value: "", label: "All types" },

  ...HEATMAP_JOB_TYPES,

];



export const DATE_PRESETS = [

  { id: "all", label: "All time" },

  { id: "30d", label: "Last 30 days" },

  { id: "7d", label: "Last 7 days" },

  { id: "custom", label: "Custom" },

];



export const TIME_PRESETS = [

  { id: "all", label: "All hours" },

  { id: "business", label: "8am – 6pm", hourFrom: 8, hourTo: 18 },

  { id: "morning", label: "6am – 12pm", hourFrom: 6, hourTo: 11 },

  { id: "afternoon", label: "12pm – 6pm", hourFrom: 12, hourTo: 17 },

  { id: "evening", label: "6pm – 12am", hourFrom: 18, hourTo: 23 },

  { id: "night", label: "12am – 6am", hourFrom: 0, hourTo: 5 },

  { id: "custom", label: "Custom" },

];



export const RADIUS_OPTIONS = [0.5, 1, 2];

/** Brand-aligned concentration bands (theme.css primary scale). */
export const HEAT_CONCENTRATION_LEVELS = [
  { label: "Few", color: "#FCEAEA", hint: "Sparse" },
  { label: "Some", color: "#C5D4DC", cssVar: "--color-primary-lighter", hint: "Low" },
  { label: "Moderate", color: "#1A4A63", cssVar: "--color-primary-light", hint: "Medium" },
  { label: "Many", color: "#0A2635", cssVar: "--color-primary", hint: "High" },
  { label: "Hotspot", color: "#061820", cssVar: "--color-primary-hover", hint: "Very high" },
];



/**

 * @param {'all'|'30d'|'7d'|'custom'} preset

 * @param {string|null} customFrom ISO date

 * @param {string|null} customTo ISO date

 * @returns {{ from?: string, to?: string }}

 */

export function resolveDateRange(preset, customFrom, customTo) {

  if (preset === "custom") {

    const out = {};

    if (customFrom) out.from = new Date(customFrom).toISOString();

    if (customTo) {

      const end = new Date(customTo);

      end.setHours(23, 59, 59, 999);

      out.to = end.toISOString();

    }

    return out;

  }

  if (preset === "all") return {};



  const to = new Date();

  const from = new Date();

  if (preset === "7d") from.setDate(from.getDate() - 7);

  else if (preset === "30d") from.setDate(from.getDate() - 30);

  from.setHours(0, 0, 0, 0);

  return { from: from.toISOString(), to: to.toISOString() };

}



/**

 * @param {string|null|undefined} timeStr HH:mm

 * @returns {number|null} hour 0–23

 */

export function parseTimeToHour(timeStr) {

  if (!timeStr) return null;

  const [h] = String(timeStr).split(":").map(Number);

  if (!Number.isFinite(h) || h < 0 || h > 23) return null;

  return h;

}



/**

 * @param {'all'|'business'|'morning'|'afternoon'|'evening'|'night'|'custom'} preset

 * @param {string|null} customFromTime HH:mm

 * @param {string|null} customToTime HH:mm

 * @returns {{ hourFrom?: number, hourTo?: number }}

 */

export function resolveTimeRange(preset, customFromTime, customToTime) {

  if (preset === "all") return {};

  const p = TIME_PRESETS.find((x) => x.id === preset);

  if (preset !== "custom" && p?.hourFrom != null) {

    return { hourFrom: p.hourFrom, hourTo: p.hourTo };

  }

  if (preset === "custom") {

    const hourFrom = parseTimeToHour(customFromTime);

    const hourTo = parseTimeToHour(customToTime);

    const out = {};

    if (hourFrom != null) out.hourFrom = hourFrom;

    if (hourTo != null) out.hourTo = hourTo;

    return out;

  }

  return {};

}



/**

 * @param {number|null|undefined} hour 0–23

 * @returns {string}

 */

export function formatHourLabel(hour) {

  if (hour == null || !Number.isFinite(hour)) return "";

  const h = hour % 24;

  if (h === 0) return "12am";

  if (h === 12) return "12pm";

  if (h < 12) return `${h}am`;

  return `${h - 12}pm`;

}



/**

 * @param {{ hourFrom?: number, hourTo?: number }} range

 * @returns {string}

 */

export function formatTimeRangeLabel(range) {

  if (range?.hourFrom == null && range?.hourTo == null) return "";

  const from = range.hourFrom ?? 0;

  const to = range.hourTo ?? 23;

  return `${formatHourLabel(from)} – ${formatHourLabel(to)} (Qatar)`;

}



/**

 * @param {string|null|undefined} iso

 * @returns {string}

 */

export function formatShortDate(iso) {

  if (!iso) return "";

  const d = new Date(iso);

  if (Number.isNaN(d.getTime())) return "";

  return d.toLocaleDateString(undefined, {

    year: "numeric",

    month: "short",

    day: "numeric",

  });

}



/**

 * @param {{ dateMin?: string|null, dateMax?: string|null }} stats

 * @returns {string}

 */

export function formatStatsDateSpan(stats) {

  const a = formatShortDate(stats?.dateMin);

  const b = formatShortDate(stats?.dateMax);

  if (a && b) return `${a} – ${b}`;

  if (a) return a;

  if (b) return b;

  return "";

}



/** Light minimalist base map — keeps labels readable under heat overlay */

export const mapOptions = {

  disableDefaultUI: false,

  zoomControl: true,

  mapTypeControl: false,

  streetViewControl: false,

  fullscreenControl: true,

  gestureHandling: "greedy",

  clickableIcons: false,

  maxZoom: 18,

  styles: [

    { elementType: "geometry", stylers: [{ color: "#f3f4f6" }] },

    { elementType: "labels.text.fill", stylers: [{ color: "#6b7280" }] },

    { elementType: "labels.text.stroke", stylers: [{ color: "#f9fafb" }] },

    {

      featureType: "road",

      elementType: "geometry",

      stylers: [{ color: "#ffffff" }],

    },

    {

      featureType: "road",

      elementType: "geometry.stroke",

      stylers: [{ color: "#e5e7eb" }],

    },

    {

      featureType: "road.highway",

      elementType: "geometry",

      stylers: [{ color: "#e5e7eb" }],

    },

    {

      featureType: "road.highway",

      elementType: "geometry.stroke",

      stylers: [{ color: "#d1d5db" }],

    },

    {

      featureType: "water",

      elementType: "geometry",

      stylers: [{ color: "#dbeafe" }],

    },

    { featureType: "poi", stylers: [{ visibility: "off" }] },

    { featureType: "transit", stylers: [{ visibility: "off" }] },

  ],

};



/** Haversine distance in meters between two lat/lng points. */
export function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dp / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Click pick radius — tighter when zoomed in. */
export function dotPickRadiusMeters(zoom) {
  if (zoom >= 15) return 22;
  if (zoom >= 13) return 35;
  if (zoom >= 11) return 50;
  return 70;
}

/**
 * @param {{ lat: number, lng: number }[]} dots
 * @param {number} lat
 * @param {number} lng
 * @param {number} maxMeters
 */
export function findNearestDot(dots, lat, lng, maxMeters) {
  let best = null;
  let bestDist = maxMeters;
  for (const dot of dots) {
    const dist = distanceMeters(lat, lng, dot.lat, dot.lng);
    if (dist < bestDist) {
      bestDist = dist;
      best = dot;
    }
  }
  return best;
}

/** Normalize LatLng(...) for preview display (mirrors shared backend util). */

export function normalizeLocationString(raw) {

  if (raw == null) return "";

  const s = String(raw).trim();

  const m = s.match(

    /LatLng\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/i

  );

  if (m) return `${m[1]}, ${m[2]}`;

  return s;

}


