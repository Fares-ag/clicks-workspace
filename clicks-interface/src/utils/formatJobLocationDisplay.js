/**
 * Show job location as "lat, lng" when coordinates exist; otherwise raw text.
 * @param {{ location?: unknown, locationCoordinates?: { coordinates?: number[] } } | null | undefined} job
 * @returns {string}
 */
export function formatJobLocationDisplay(job) {
  const geo = job?.locationCoordinates;
  if (Array.isArray(geo?.coordinates) && geo.coordinates.length >= 2) {
    const lng = Number(geo.coordinates[0]);
    const lat = Number(geo.coordinates[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return `${lat}, ${lng}`;
    }
  }

  const raw = String(job?.location ?? "").trim();
  if (!raw) return "";

  const coord = raw.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (coord) return `${coord[1]}, ${coord[2]}`;

  return raw;
}

/**
 * Google Maps link from job coordinates or location text.
 * @param {{ location?: unknown, locationCoordinates?: { coordinates?: number[] } } | null | undefined} job
 * @returns {string}
 */
export function buildJobMapsLink(job) {
  const display = formatJobLocationDisplay(job);
  if (!display) return "";

  const coord = display.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (coord) {
    return `https://www.google.com/maps?q=${coord[1]},${coord[2]}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(display)}`;
}
