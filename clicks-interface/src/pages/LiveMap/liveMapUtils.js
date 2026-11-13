/** Live Map merge / freshness helpers (shared with LiveMap.jsx + node tests). */

export const LOCATION_STALE_MS = 60000;
/** REST poll while the admin socket is down. */
export const REST_POLL_MS = 8000;
/**
 * REST re-read while the socket is UP.
 *
 * The socket carries the real-time feed, but it can stop delivering without
 * ever reporting a disconnect, and an event missed during a reconnect is gone
 * for good. With no periodic re-read the map could only be corrected by a page
 * reload. This is the safety net that makes it self-healing.
 */
export const REST_RESYNC_MS = 20000;
/**
 * How long a technician known only from socket events is kept while REST has
 * not listed them yet. Longer than two re-reads, so a technician who has just
 * come Online is never dropped between an event and the next snapshot.
 */
export const SOCKET_ONLY_GRACE_MS = 45000;
/**
 * How long a technician we were told went Offline is kept out of REST merges,
 * so a snapshot already in flight cannot put them back on the map.
 */
export const OFFLINE_ECHO_GUARD_MS = 30000;
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
  return nowMs - new Date(presenceAt).getTime() < SOCKET_ONLY_GRACE_MS;
}

/**
 * Fold a REST snapshot into the technicians already on screen.
 *
 * - Technicians in the snapshot are merged with what the socket has told us,
 *   keeping whichever source holds the newer measurement.
 * - Technicians known only from socket events are kept for a grace period, so
 *   someone who has just come Online survives until REST lists them.
 * - Technicians we were just told went Offline are skipped, so a snapshot that
 *   was already in flight cannot resurrect them.
 *
 * @param {object[]} apiTechnicians snapshot rows
 * @param {object[]} prev current state
 * @param {Map<string, number>} [recentlyOffline] id -> ms when Offline arrived
 * @returns {{ technicians: object[], apiIds: Set<string> }}
 */
export function mergeLiveMapSnapshot(
  apiTechnicians,
  prev,
  recentlyOffline = new Map(),
  nowMs = Date.now()
) {
  const prevById = new Map(prev.map((t) => [String(t._id), t]));
  const apiIds = new Set();
  const merged = [];

  for (const apiTech of apiTechnicians) {
    const id = String(apiTech._id);
    const wentOfflineAt = recentlyOffline.get(id);
    if (wentOfflineAt != null && nowMs - wentOfflineAt < OFFLINE_ECHO_GUARD_MS) {
      continue;
    }
    apiIds.add(id);
    merged.push(mergeApiTechnicianWithSocketState(apiTech, prevById.get(id), nowMs));
  }

  const socketOnly = prev.filter((t) => isSocketOnlyPreserved(t, apiIds, nowMs));
  return { technicians: [...merged, ...socketOnly], apiIds };
}

export function countVisibleStaleTechnicians(technicians, nowMs = Date.now()) {
  return technicians.filter(
    (t) => ["Online", "On Job"].includes(t.currentStatus) && isTechPresenceStale(t, nowMs)
  ).length;
}
