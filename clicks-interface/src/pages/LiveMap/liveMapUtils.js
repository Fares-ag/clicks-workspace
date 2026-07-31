/** Live Map merge / freshness helpers (shared with LiveMap.jsx + node tests). */

export const LOCATION_STALE_MS = 60000;
export const REST_POLL_MS = 8000;
export const SOCKET_COORD_PREFERENCE_MS = 60000;

export function getTechLastLocationAt(tech) {
  return tech?.lastLocationAt || tech?._locationUpdatedAt || null;
}

export function isTechLocationStale(tech, nowMs = Date.now()) {
  if (tech?.locationStale === true) return true;
  const ts = getTechLastLocationAt(tech);
  if (!ts) return true;
  return nowMs - new Date(ts).getTime() >= LOCATION_STALE_MS;
}

export function formatLastSeen(tech, nowMs = Date.now()) {
  const ts = getTechLastLocationAt(tech);
  if (!ts) return "Unknown";
  const sec = Math.max(0, Math.floor((nowMs - new Date(ts).getTime()) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

/** Merge REST snapshot with fresher socket state (timestamped only). */
export function mergeApiTechnicianWithSocketState(apiTech, existing, nowMs = Date.now()) {
  const id = String(apiTech._id);
  const base = {
    ...apiTech,
    _id: id,
    lastLocationAt: apiTech.lastLocationAt,
    locationStale: apiTech.locationStale,
  };

  if (!existing?._locationUpdatedAt || !existing.location) {
    return base;
  }

  const socketMs = new Date(existing._locationUpdatedAt).getTime();
  if (nowMs - socketMs < SOCKET_COORD_PREFERENCE_MS) {
    return {
      ...base,
      location: existing.location,
      _locationUpdatedAt: existing._locationUpdatedAt,
      lastLocationAt: existing.lastLocationAt || apiTech.lastLocationAt,
      locationStale: existing.locationStale ?? apiTech.locationStale,
      _socketPresenceAt: existing._socketPresenceAt,
    };
  }

  return base;
}

export function isSocketOnlyPreserved(tech, apiIds, nowMs = Date.now()) {
  const id = String(tech._id);
  if (apiIds.has(id)) return false;
  if (!["Online", "On Job"].includes(tech.currentStatus)) return false;
  const presenceAt = tech._socketPresenceAt || tech._locationUpdatedAt;
  if (!presenceAt) return false;
  return nowMs - new Date(presenceAt).getTime() < REST_POLL_MS * 2;
}

export function countVisibleStaleTechnicians(technicians, nowMs = Date.now()) {
  return technicians.filter(
    (t) => ["Online", "On Job"].includes(t.currentStatus) && isTechLocationStale(t, nowMs)
  ).length;
}
