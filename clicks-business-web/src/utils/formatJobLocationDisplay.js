/**
 * Show job location as "lat, lng" when coordinates exist.
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
  if (!raw) return "—";

  const coord = raw.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (coord) return `${coord[1]}, ${coord[2]}`;

  return raw;
}
