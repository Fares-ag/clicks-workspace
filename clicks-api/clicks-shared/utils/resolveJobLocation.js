const {
  parseJobLocation,
  toGeoPoint,
  isExpandableMapsUrl,
  extractGeocodeQuery,
} = require("./parseJobLocation");

const GOOGLE_MAPS_BASE = "https://maps.googleapis.com/maps/api";
const EXPAND_TIMEOUT_MS = 8000;
const GEOCODE_TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 5;

function getMapsKey() {
  return (process.env.GOOGLE_MAPS_API_KEY || "").trim();
}

/**
 * Follow redirects for short Maps links and return the final URL.
 * @param {string} url
 * @returns {Promise<string>}
 */
async function expandShortUrl(url) {
  let current = String(url).trim();
  for (let i = 0; i < MAX_REDIRECTS; i += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), EXPAND_TIMEOUT_MS);
    try {
      const res = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": "ClicksLocationResolver/1.0",
        },
      });
      if (res.status >= 300 && res.status < 400) {
        const next = res.headers.get("location");
        if (!next) break;
        current = new URL(next, current).href;
        continue;
      }
      break;
    } finally {
      clearTimeout(timer);
    }
  }
  return current;
}

/**
 * Geocode an address or place query to Qatar-bounded coordinates.
 * @param {string} query
 * @returns {Promise<{ lat: number, lng: number } | null>}
 */
async function geocodeQuery(query) {
  const key = getMapsKey();
  if (!key) return null;

  const params = new URLSearchParams({
    address: String(query).trim(),
    region: "qa",
    key,
  });
  const url = `${GOOGLE_MAPS_BASE}/geocode/json?${params.toString()}`;

  // Bounded like expandShortUrl — this runs inside job creation, so a stalled
  // upstream must not hold the dispatch request open.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS);
  let data;
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    data = await res.json();
  } catch {
    // abort / network failure / malformed body — no coordinates
    return null;
  } finally {
    clearTimeout(timer);
  }

  if (!data || data.status !== "OK" || !Array.isArray(data.results) || !data.results.length) {
    return null;
  }

  const loc = data.results[0]?.geometry?.location;
  if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) {
    return null;
  }

  return parseJobLocation(`${loc.lat}, ${loc.lng}`);
}

/**
 * Resolve a location string to GeoJSON Point (async: expands short links + geocodes).
 * Keeps the original string in Job.location; only returns coordinates.
 * @param {unknown} raw
 * @returns {Promise<{ type: 'Point', coordinates: [number, number] } | null>}
 */
async function resolveJobLocationToGeoPoint(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;

  let coords = parseJobLocation(s);
  if (coords) return toGeoPoint(coords);

  let expanded = s;
  if (isExpandableMapsUrl(s)) {
    try {
      expanded = await expandShortUrl(s);
      coords = parseJobLocation(expanded);
      if (coords) return toGeoPoint(coords);
    } catch {
      // fall through to geocode
    }
  }

  const geocodeInput = extractGeocodeQuery(expanded) || extractGeocodeQuery(s);
  if (!geocodeInput) return null;

  try {
    coords = await geocodeQuery(geocodeInput);
    if (coords) return toGeoPoint(coords);
  } catch {
    return null;
  }

  return null;
}

module.exports = {
  expandShortUrl,
  geocodeQuery,
  resolveJobLocationToGeoPoint,
};
