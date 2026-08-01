/**
 * Parse job location strings into Qatar-bounded lat/lng coordinates.
 * Supports LatLng(...), plain "lat, lng", Waze URLs, and Google Maps URLs.
 */

/** Rough Qatar bounding box to reject garbage / wrong-country points */
const QATAR_BOUNDS = {
  minLat: 24.0,
  maxLat: 26.5,
  minLng: 50.0,
  maxLng: 52.5,
};

function isWithinQatar(lat, lng) {
  return (
    lat >= QATAR_BOUNDS.minLat &&
    lat <= QATAR_BOUNDS.maxLat &&
    lng >= QATAR_BOUNDS.minLng &&
    lng <= QATAR_BOUNDS.maxLng
  );
}

/**
 * @param {number} lat
 * @param {number} lng
 * @returns {{ lat: number, lng: number } | null}
 */
function validateCoords(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (!isWithinQatar(lat, lng)) return null;
  return { lat, lng };
}

/**
 * @param {unknown} raw
 * @returns {{ lat: number, lng: number } | null}
 */
function parseJobLocation(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // LatLng(25.15, 51.58)
  let m = s.match(
    /LatLng\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/i
  );
  if (m) return validateCoords(Number(m[1]), Number(m[2]));

  // Plain "lat, lng"
  m = s.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (m) return validateCoords(Number(m[1]), Number(m[2]));

  // Waze: ll.25.xxx%2C51.xxx or ll.25.xxx,51.xxx
  m =
    s.match(/ll\.(-?\d+(?:\.\d+)?)%2C(-?\d+(?:\.\d+)?)/i) ||
    s.match(/ll\.(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i);
  if (m) return validateCoords(Number(m[1]), Number(m[2]));

  // Google Maps: @lat,lng
  m = s.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (m) return validateCoords(Number(m[1]), Number(m[2]));

  // Google place: q=lat,lng
  m = s.match(/[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i);
  if (m) return validateCoords(Number(m[1]), Number(m[2]));

  return null;
}

/**
 * @param {{ lat: number, lng: number }} coords
 * @returns {{ type: 'Point', coordinates: [number, number] }}
 */
function toGeoPoint({ lat, lng }) {
  return {
    type: "Point",
    coordinates: [lng, lat],
  };
}

/**
 * Parse location string and return GeoJSON Point, or null.
 * @param {unknown} raw
 * @returns {{ type: 'Point', coordinates: [number, number] } | null}
 */
function parseJobLocationToGeoPoint(raw) {
  const coords = parseJobLocation(raw);
  if (!coords) return null;
  return toGeoPoint(coords);
}

/**
 * Normalize location for display: LatLng → "lat, lng", else trimmed string.
 * @param {unknown} raw
 * @returns {string}
 */
function normalizeLocationString(raw) {
  if (raw == null) return "";
  const s = String(raw).trim();
  const m = s.match(
    /LatLng\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/i
  );
  if (m) return `${m[1]}, ${m[2]}`;
  return s;
}

module.exports = {
  QATAR_BOUNDS,
  isWithinQatar,
  parseJobLocation,
  toGeoPoint,
  parseJobLocationToGeoPoint,
  normalizeLocationString,
};
