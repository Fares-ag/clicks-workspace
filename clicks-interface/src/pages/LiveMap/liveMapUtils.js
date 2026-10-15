/** Live Map merge / freshness helpers (shared with LiveMap.jsx + node tests). */

export const LOCATION_STALE_MS = 60000;
export const REST_POLL_MS = 8000;
export const SOCKET_COORD_PREFERENCE_MS = 60000;

/** Parse a timestamp to epoch ms, or null when absent/unparseable. */
function toMs(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function getTechLastLocationAt(tech) {
  return tech?.lastLocationAt || tech?._locationUpdatedAt || null;
}

export function getTechLastHeartbeatAt(tech) {
  return tech?.lastHeartbeatAt || tech?._socketPresenceAt || null;
}

function isTimestampStale(value, nowMs) {
  const ms = toMs(value);
  if (ms == null) return true;
  return nowMs - ms >= LOCATION_STALE_MS;
}

/** GPS measurement is older than the window (van may still be connected). */
export function isTechGpsStale(tech, nowMs = Date.now()) {
  const ts = getTechLastLocationAt(tech);
  if (!ts) return true;
  return isTimestampStale(ts, nowMs);
}

/**
 * App is not checking in. Parked techs with a live heartbeat are NOT presence-stale
 * even if GPS has not produced a new point.
 */
export function isTechPresenceStale(tech, nowMs = Date.now()) {
  if (tech?.presenceStale === true) return true;
  const heard = getTechLastHeartbeatAt(tech);
  if (heard) return isTimestampStale(heard, nowMs);
  // Legacy payloads without lastHeartbeatAt — same as GPS age.
  if (tech?.locationStale === true) return true;
  return isTechGpsStale(tech, nowMs);
}

/** @deprecated Use isTechPresenceStale for marker fade; isTechGpsStale for GPS age. */
export function isTechLocationStale(tech, nowMs = Date.now()) {
  return isTechPresenceStale(tech, nowMs);
}

export function formatAge(value, nowMs = Date.now()) {
  const ms = toMs(value);
  if (ms == null) return "Unknown";
  const sec = Math.max(0, Math.floor((nowMs - ms) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

export function formatLastSeen(tech, nowMs = Date.now()) {
  return formatAge(getTechLastLocationAt(tech), nowMs);
}

export function formatPresenceLabel(tech, nowMs = Date.now()) {
  if (isTechPresenceStale(tech, nowMs)) {
    return `Disconnected · last GPS ${formatLastSeen(tech, nowMs)}`;
  }
  if (isTechGpsStale(tech, nowMs)) {
    return `Connected · GPS ${formatLastSeen(tech, nowMs)}`;
  }
  return "Live";
}

/**
 * Merge the REST snapshot with socket state, preferring whichever source
 * describes the NEWER MEASUREMENT.
 *
 * Preferring socket state because its last message merely *arrived* recently is
 * what let a silently-dead socket pin an old position on the map while fresher
 * REST snapshots were discarded — with the badge still reading "Connected".
 * Comparing measurement times makes the stale path self-correcting.
 */
function newerIso(a, b) {
  const am = toMs(a);
  const bm = toMs(b);
  if (am == null) return b || null;
  if (bm == null) return a || null;
  return am >= bm ? a : b;
}

export function mergeApiTechnicianWithSocketState(apiTech, existing, nowMs = Date.now()) {
  const id = String(apiTech._id);
  const lastHeartbeatAt = newerIso(
    apiTech.lastHeartbeatAt,
    newerIso(existing?.lastHeartbeatAt, existing?._socketPresenceAt)
  );
  const heartbeatMs = toMs(lastHeartbeatAt);
  const presenceStale =
    heartbeatMs == null
      ? apiTech.presenceStale === true
      : nowMs - heartbeatMs >= LOCATION_STALE_MS;

  const base = {
    ...apiTech,
    _id: id,
    lastLocationAt: apiTech.lastLocationAt,
    lastHeartbeatAt,
    locationStale: apiTech.locationStale,
    presenceStale,
  };

  if (!existing?._locationUpdatedAt || !existing.location) {
    return base;
  }

  // Fall back to arrival time only when the socket payload carried no
  // measurement time (older server build).
  const socketMs = toMs(existing.lastLocationAt) ?? toMs(existing._locationUpdatedAt);
  const apiMs = toMs(apiTech.lastLocationAt);

  if (socketMs === null) return base;
  if (apiMs !== null && apiMs >= socketMs) return base;

  return {
    ...base,
    location: existing.location,
    _locationUpdatedAt: existing._locationUpdatedAt,
    lastLocationAt: existing.lastLocationAt || apiTech.lastLocationAt,
    lastHeartbeatAt,
    locationStale: existing.locationStale ?? apiTech.locationStale,
    presenceStale,
    _socketPresenceAt: existing._socketPresenceAt,
  };
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
    (t) => ["Online", "On Job"].includes(t.currentStatus) && isTechPresenceStale(t, nowMs)
  ).length;
}
