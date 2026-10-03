const { distanceBetween } = require("./geoDistance");

const MIN_MOVE_METERS = Number(process.env.LOCATION_MIN_MOVE_METERS || 15);
const MAX_ACCURACY_M = Number(process.env.LOCATION_MAX_ACCURACY_M || 50);
const THROTTLE_MS = Number(process.env.LOCATION_THROTTLE_MS || 3000);
const HEARTBEAT_THROTTLE_MS = Number(
  process.env.LOCATION_HEARTBEAT_THROTTLE_MS || 10000
);
const SAME_COORD_TOLERANCE_M = 1;
/** A client clock running fast must not be able to stamp itself fresh forever. */
const MAX_FIX_FUTURE_SKEW_MS = 60000;

/** @type {Map<string, { lat: number, lng: number, lastWriteAt: number, lastHeartbeatAt: number }>} */
const stateByTechId = new Map();

function resetTechnicianLocationWriteStateForTests() {
  stateByTechId.clear();
}

function setLocationWriteStateForTests(technicianId, patch) {
  const state = stateByTechId.get(String(technicianId));
  if (state) Object.assign(state, patch);
}

/**
 * Strict coordinate parse.
 *
 * Number() maps null, "", false and [] all to 0, and 0,0 is a real point in the
 * Gulf of Guinea — so a malformed payload that reaches a bare Number.isFinite()
 * check silently overwrites a working technician's position with Null Island.
 * Only real numbers and numeric strings are accepted here.
 *
 * @returns {number|null} null when the value is not a usable coordinate
 */
function toCoordinate(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Parse and range-check a lat/lng pair.
 * Exact 0,0 is rejected as the "no fix" sentinel — loadStateFromDb already
 * treats a stored 0,0 as "no known position", so it must never be written.
 *
 * @returns {{ lat: number, lng: number }|null}
 */
function parseCoordinatePair(latitude, longitude) {
  const lat = toCoordinate(latitude);
  const lng = toCoordinate(longitude);
  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90) return null;
  if (lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

/**
 * Resolve when the position was actually MEASURED.
 *
 * The technician app runs a liveness heartbeat that re-sends the last accepted
 * pin every 12s without reading GPS. Stamping those with server receive time
 * makes a technician whose GPS has died read "Live" forever at a frozen point,
 * which defeats every staleness signal downstream. Trusting the fix time
 * instead lets a frozen position age out on its own.
 *
 * Falls back to null (caller uses now) when absent or unusable, so older app
 * builds that do not send a fix time keep working exactly as before.
 *
 * @returns {Date|null}
 */
function resolveFixTime(fixTime, nowMs) {
  if (fixTime == null || fixTime === "") return null;
  const parsed =
    fixTime instanceof Date ? fixTime.getTime() : Date.parse(String(fixTime));
  if (!Number.isFinite(parsed)) return null;
  if (parsed > nowMs + MAX_FIX_FUTURE_SKEW_MS) return null;
  return new Date(Math.min(parsed, nowMs));
}

function isAccuracyAcceptable(accuracy) {
  if (accuracy == null || accuracy === "") return true;
  const value = Number(accuracy);
  if (!Number.isFinite(value)) return true;
  if (value <= 0) return false;
  return value <= MAX_ACCURACY_M;
}

function isSameCoords(aLat, aLng, bLat, bLng) {
  return (
    distanceBetween({ lat: aLat, lng: aLng }, { lat: bLat, lng: bLng }) <=
    SAME_COORD_TOLERANCE_M
  );
}

async function loadStateFromDb(Technician, technicianId) {
  const tech = await Technician.findById(technicianId)
    .select("currentLocation.coordinates")
    .lean();
  const coords = tech?.currentLocation?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
    return null;
  }
  return { lat, lng, lastWriteAt: 0, lastHeartbeatAt: 0 };
}

/**
 * Apply unified location write policy for socket + REST paths.
 *
 * @param {object} params
 * @param {import('mongoose').Model} params.Technician
 * @param {string} params.technicianId
 * @param {number} params.latitude
 * @param {number} params.longitude
 * @param {number} [params.accuracy]
 * @param {string|Date} [params.fixTime] when the GPS fix was measured (not received)
 * @param {(technicianId: string, lat: number, lng: number, lastLocationAt: Date) => void} [params.onAdminBroadcast]
 * @returns {Promise<{ ok: boolean, skipped?: boolean, reason?: string, coordsChanged?: boolean, heartbeat?: boolean, lat: number, lng: number, lastLocationAt?: Date }>}
 */
async function applyTechnicianLocationWrite({
  Technician,
  technicianId,
  latitude,
  longitude,
  accuracy,
  fixTime,
  onAdminBroadcast,
}) {
  const id = String(technicianId);
  const parsed = parseCoordinatePair(latitude, longitude);

  if (!parsed) {
    return {
      ok: false,
      skipped: true,
      reason: "invalid_coords",
      lat: Number(latitude),
      lng: Number(longitude),
    };
  }

  const { lat, lng } = parsed;

  if (!isAccuracyAcceptable(accuracy)) {
    return { ok: false, skipped: true, reason: "accuracy", lat, lng };
  }

  const now = Date.now();
  let state = stateByTechId.get(id);
  if (!state) {
    state = await loadStateFromDb(Technician, id);
    if (state) stateByTechId.set(id, state);
  }

  const lastLocationAt = resolveFixTime(fixTime, now) || new Date();

  if (!state) {
    await Technician.updateOne(
      { _id: id },
      {
        "currentLocation.coordinates": [lng, lat],
        lastLocationAt,
      }
    );
    stateByTechId.set(id, {
      lat,
      lng,
      lastWriteAt: now,
      lastHeartbeatAt: now,
    });
    if (typeof onAdminBroadcast === "function") {
      onAdminBroadcast(id, lat, lng, lastLocationAt);
    }
    return {
      ok: true,
      coordsChanged: true,
      lat,
      lng,
      lastLocationAt,
    };
  }

  const movedMeters = distanceBetween(
    { lat: state.lat, lng: state.lng },
    { lat, lng }
  );

  if (isSameCoords(state.lat, state.lng, lat, lng)) {
    if (now - state.lastHeartbeatAt < HEARTBEAT_THROTTLE_MS) {
      return { ok: false, skipped: true, reason: "heartbeat_throttle", lat, lng };
    }
    state.lastHeartbeatAt = now;
    await Technician.updateOne({ _id: id }, { lastLocationAt });
    if (typeof onAdminBroadcast === "function") {
      onAdminBroadcast(id, lat, lng, lastLocationAt);
    }
    return {
      ok: true,
      coordsChanged: false,
      heartbeat: true,
      lat,
      lng,
      lastLocationAt,
    };
  }

  if (movedMeters < MIN_MOVE_METERS) {
    return { ok: false, skipped: true, reason: "min_move", lat, lng };
  }

  if (now - state.lastWriteAt < THROTTLE_MS) {
    return { ok: false, skipped: true, reason: "throttle", lat, lng };
  }

  await Technician.updateOne(
    { _id: id },
    {
      "currentLocation.coordinates": [lng, lat],
      lastLocationAt,
    }
  );
  state.lat = lat;
  state.lng = lng;
  state.lastWriteAt = now;
  state.lastHeartbeatAt = now;

  if (typeof onAdminBroadcast === "function") {
    onAdminBroadcast(id, lat, lng, lastLocationAt);
  }

  return {
    ok: true,
    coordsChanged: true,
    lat,
    lng,
    lastLocationAt,
  };
}

module.exports = {
  applyTechnicianLocationWrite,
  parseCoordinatePair,
  resolveFixTime,
  resetTechnicianLocationWriteStateForTests,
  setLocationWriteStateForTests,
  MIN_MOVE_METERS,
  MAX_ACCURACY_M,
  THROTTLE_MS,
  HEARTBEAT_THROTTLE_MS,
};
