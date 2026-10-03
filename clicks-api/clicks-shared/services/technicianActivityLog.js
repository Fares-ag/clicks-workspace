const TechnicianActivityLog = require("../models/TechnicianActivityLog");
const {
  TECHNICIAN_ACTIVITY_EVENTS,
  technicianActivityCategory,
  technicianActivityLabel,
} = require("../constants/technicianActivityEvents");

/**
 * Writer for the technician activity trail.
 *
 * Call sites treat this as fire-and-forget: a log write must never fail or slow
 * down the technician's request, so every error is swallowed and callers do not
 * await. Tests await `flushTechnicianActivity()` instead.
 *
 * Never pass credentials in `metadata` — `sanitizeMetadata` drops anything that
 * looks like one, but the call site should not send it in the first place.
 */

const MAX_METADATA_BYTES = 4096;
const CREDENTIAL_KEYS = /^(password|new_?password|old_?password|token|refresh_?token|fcm_?token|otp|secret|authorization)$/i;

/** In-process throttle for location pings, keyed by technician id. */
const lastLocationLogAt = new Map();
const LOCATION_MIN_INTERVAL_MS = Number(
  process.env.TECHNICIAN_ACTIVITY_LOCATION_MIN_INTERVAL_MS ?? 5 * 60 * 1000
);
const LOCATION_LOGGING_ENABLED =
  String(process.env.TECHNICIAN_ACTIVITY_LOG_LOCATION ?? "true") !== "false";

/** In-flight writes, so tests can wait for them. */
const pendingWrites = new Set();

function clientIp(req) {
  if (!req) return "";
  const forwarded = req.headers?.["x-forwarded-for"];
  if (forwarded) return String(forwarded).split(",")[0].trim().slice(0, 64);
  return String(req.ip || req.connection?.remoteAddress || "").slice(0, 64);
}

/**
 * Request context the app sends (or the platform adds). The technician app is
 * free to omit these; they are recorded when present.
 */
function requestContext(req) {
  if (!req) return {};
  const headers = req.headers || {};
  return {
    ip: clientIp(req),
    user_agent: String(headers["user-agent"] || "").slice(0, 256),
    app_version: String(
      headers["x-app-version"] || headers["x-client-version"] || ""
    ).slice(0, 32),
    platform: String(
      headers["x-app-platform"] || headers["x-client-platform"] || ""
    ).slice(0, 32),
  };
}

function sanitizeMetadata(metadata) {
  if (metadata == null) return null;
  let value = metadata;
  if (typeof value === "object") {
    value = Array.isArray(value) ? [...value] : { ...value };
    if (!Array.isArray(value)) {
      for (const key of Object.keys(value)) {
        if (CREDENTIAL_KEYS.test(key)) delete value[key];
        else if (value[key] === undefined) delete value[key];
      }
    }
  }
  try {
    const serialized = JSON.stringify(value);
    if (serialized && serialized.length > MAX_METADATA_BYTES) {
      return { truncated: true, bytes: serialized.length };
    }
  } catch {
    return { unserializable: true };
  }
  return value;
}

function toGeoPoint(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  if (lat === 0 && lng === 0) return undefined;
  return { type: "Point", coordinates: [lng, lat] };
}

function technicianDisplayName(technician) {
  if (!technician) return "";
  const name = `${technician.firstName || ""} ${technician.lastName || ""}`.trim();
  return name.slice(0, 128);
}

/**
 * Record one technician-app event.
 *
 * @param {object}  input
 * @param {object} [input.req]            Express request (ip / headers / user).
 * @param {object} [input.technician]     Technician doc when already loaded.
 * @param {string} [input.technicianId]   Falls back to req.user.id.
 * @param {string}  input.event           Key from TECHNICIAN_ACTIVITY_EVENTS.
 * @param {string} [input.outcome]        success | failure | blocked.
 * @param {string} [input.message]        Overrides the catalog label.
 * @param {string} [input.identifier]     Typed phone/email (failed logins).
 * @param {string} [input.jobId]
 * @param {string} [input.jobReference]
 * @param {object} [input.metadata]
 * @param {number} [input.statusCode]
 * @param {number} [input.latitude]
 * @param {number} [input.longitude]
 * @returns {Promise<void>} resolves once written (or dropped); never rejects.
 */
function recordTechnicianActivity(input = {}) {
  let promise;
  promise = writeEntry(input)
    .catch((err) => {
      // A broken log must not break the app; surface it in the service logs.
      console.error(
        JSON.stringify({
          level: "error",
          msg: "technician_activity_log_failed",
          event: input?.event,
          error: err?.message,
        })
      );
    })
    .finally(() => {
      pendingWrites.delete(promise);
    });
  pendingWrites.add(promise);
  return promise;
}

async function writeEntry(input) {
  const {
    req,
    technician,
    technicianId,
    event,
    outcome = "success",
    message,
    identifier,
    jobId,
    jobReference,
    metadata,
    statusCode,
    latitude,
    longitude,
  } = input;

  if (!event || !TECHNICIAN_ACTIVITY_EVENTS[event]) {
    // Unknown events would be invisible in the admin filters — refuse loudly
    // in development, drop quietly in production.
    if (process.env.NODE_ENV !== "production") {
      throw new Error(`Unknown technician activity event: ${event}`);
    }
    return;
  }

  if (event === "location.updated") {
    if (!LOCATION_LOGGING_ENABLED) return;
    const key = String(technicianId || technician?._id || req?.user?.id || "");
    const now = Date.now();
    const last = lastLocationLogAt.get(key) || 0;
    if (key && now - last < LOCATION_MIN_INTERVAL_MS) return;
    if (key) lastLocationLogAt.set(key, now);
  }

  const resolvedId =
    technicianId || technician?._id || req?.user?.id || null;

  const context = requestContext(req);
  const coordinates = toGeoPoint(latitude, longitude);

  await TechnicianActivityLog.create({
    technician_id: resolvedId || null,
    technician_name: technicianDisplayName(technician),
    identifier: String(identifier || "").slice(0, 128),
    event,
    category: technicianActivityCategory(event),
    outcome,
    message: String(message || technicianActivityLabel(event)).slice(0, 256),
    status_code: Number.isFinite(Number(statusCode)) ? Number(statusCode) : null,
    job_id: jobId || null,
    job_reference: String(jobReference || "").slice(0, 64),
    metadata: sanitizeMetadata(metadata),
    ...context,
    ...(coordinates ? { coordinates } : {}),
    at: new Date(),
  });
}

/** Wait for in-flight writes. Tests only — request paths never call this. */
async function flushTechnicianActivity() {
  await Promise.allSettled([...pendingWrites]);
}

/** Test helper: forget the location throttle between cases. */
function resetTechnicianActivityThrottle() {
  lastLocationLogAt.clear();
}

module.exports = {
  recordTechnicianActivity,
  flushTechnicianActivity,
  resetTechnicianActivityThrottle,
};
