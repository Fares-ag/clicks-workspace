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

  // Trailing "(lat, lng)" e.g. "Al Rayyan, Doha (25.260448, 51.497161)"
  m = s.match(/\((-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\)\s*$/);
  if (m) return validateCoords(Number(m[1]), Number(m[2]));

  // Plain "lat, lng"
  m = s.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (m) return validateCoords(Number(m[1]), Number(m[2]));

  // Waze: ll.25.xxx%2C51.xxx or ll.25.xxx,51.xxx
  m =
    s.match(/ll\.(-?\d+(?:\.\d+)?)%2C(-?\d+(?:\.\d+)?)/i) ||
    s.match(/ll\.(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i);
  if (m) return validateCoords(Number(m[1]), Number(m[2]));

  // Google embed: !3dLAT!4dLNG (place URLs often include both @ and !3d; prefer
  // !3d — it is the place pin, while @ is only the viewport centre). Must be
  // matched before the @ branch below.
  m = s.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/i);
  if (m) {
    const pin = validateCoords(Number(m[1]), Number(m[2]));
    if (pin) return pin;
  }

  // Google Maps: @lat,lng
  m = s.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (m) return validateCoords(Number(m[1]), Number(m[2]));

  // Google: center=lat,lng
  m = s.match(/[?&]center=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i);
  if (m) return validateCoords(Number(m[1]), Number(m[2]));

  // Google place: q=lat,lng or query=lat,lng
  m =
    s.match(/[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i) ||
    s.match(/[?&]query=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i);
  if (m) return validateCoords(Number(m[1]), Number(m[2]));

  return null;
}

/** Short-link hosts that must be expanded before coordinate parsing */
const SHORT_MAPS_HOSTS = new Set([
  "maps.app.goo.gl",
  "goo.gl",
  "g.co",
]);

/**
 * @param {unknown} raw
 * @returns {boolean}
 */
function isExpandableMapsUrl(raw) {
  if (raw == null) return false;
  const s = String(raw).trim();
  if (!/^https?:\/\//i.test(s)) return false;
  try {
    const host = new URL(s).hostname.replace(/^www\./i, "");
    return SHORT_MAPS_HOSTS.has(host) || host.endsWith(".goo.gl");
  } catch {
    return false;
  }
}

/**
 * Extract a geocode-friendly query from a location string (address or place name).
 * Returns null when coords are already parseable or input is unusable.
 * @param {unknown} raw
 * @returns {string | null}
 */
function extractGeocodeQuery(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (parseJobLocation(s)) return null;

  // Reject phone-like strings
  if (/^\+?\d[\d\s\-()]{6,}$/.test(s)) return null;

  if (/^https?:\/\//i.test(s)) {
    try {
      const url = new URL(s);
      const q =
        url.searchParams.get("q") ||
        url.searchParams.get("query") ||
        url.searchParams.get("destination");
      if (q && !/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.test(q.trim())) {
        return decodeURIComponent(q.replace(/\+/g, " ")).trim();
      }

      const placeMatch = url.pathname.match(/\/maps\/place\/([^/]+)/i);
      if (placeMatch) {
        const place = decodeURIComponent(placeMatch[1].replace(/\+/g, " "))
          .replace(/@.*$/, "")
          .trim();
        if (place) return place;
      }
    } catch {
      return null;
    }
    return null;
  }

  // Plain address / place name
  return s;
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
  isExpandableMapsUrl,
  extractGeocodeQuery,
  SHORT_MAPS_HOSTS,
};
