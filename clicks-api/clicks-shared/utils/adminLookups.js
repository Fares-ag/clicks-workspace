/**
 * Slim technician + source lookups for admin lists.
 *
 * Technician documents in Atlas carry a huge unused `performance.earningsData`
 * array. Reading even 8 of them takes ~8s, so we:
 *   1. unset that array once per process
 *   2. keep the slim roster in process memory (~10 min)
 * Expired roster data is refreshed before serving lists; toggle-active warms cache after writes.
 */
const Technician = require("../models/Technician");
const Source = require("../models/Source");

const TECH_ROSTER_MAX_AGE_MS = 10 * 60 * 1000;
const SOURCE_ROSTER_MAX_AGE_MS = 30 * 60 * 1000;
const TECH_PROJECTION = {
  firstName: 1,
  lastName: 1,
  phone: 1,
  profilePicture: 1,
  currentStatus: 1,
  applicationStatus: 1,
  isActive: 1,
  assignedVehicle: 1,
  expertise: 1,
  currentLocation: 1,
  lastLocationAt: 1,
  lastHeartbeatAt: 1,
};

let techRoster = null;
let techRosterAt = 0;
let techRosterLoading = null;
/** Bumped on invalidate so an in-flight roster load cannot overwrite a fresh write. */
let techRosterGeneration = 0;
let sourceRoster = null;
let sourceRosterAt = 0;
let sourceRosterLoading = null;
let shrinkStarted = false;

function toId(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value._id) return String(value._id);
  return String(value);
}

function mapTech(tech) {
  return {
    _id: tech._id,
    firstName: tech.firstName,
    lastName: tech.lastName,
    phone: tech.phone,
    profilePicture: tech.profilePicture,
    currentStatus: tech.currentStatus,
    applicationStatus: tech.applicationStatus,
    isActive: tech.isActive,
    assignedVehicle: tech.assignedVehicle,
    expertise: tech.expertise || [],
    currentLocation: tech.currentLocation,
    lastLocationAt: tech.lastLocationAt,
    lastHeartbeatAt: tech.lastHeartbeatAt,
  };
}

async function shrinkTechnicianDocuments() {
  if (shrinkStarted) return;
  shrinkStarted = true;
  const started = Date.now();
  try {
    const result = await Technician.updateMany(
      { "performance.earningsData": { $exists: true } },
      { $unset: { "performance.earningsData": 1 } }
    );
    console.log(
      JSON.stringify({
        msg: "tech_earningsData_unset",
        matched: result.matchedCount,
        modified: result.modifiedCount,
        ms: Date.now() - started,
      })
    );
  } catch (err) {
    shrinkStarted = false;
    console.error(
      JSON.stringify({
        msg: "tech_earningsData_unset_failed",
        error: err instanceof Error ? err.message : String(err),
      })
    );
  }
}

async function loadTechnicianRoster() {
  const gen = techRosterGeneration;
  const started = Date.now();
  await shrinkTechnicianDocuments();
  const technicians = await Technician.collection
    .find({}, { projection: TECH_PROJECTION })
    .toArray();
  if (gen !== techRosterGeneration) {
    return techRoster ?? technicians.map(mapTech);
  }
  console.log(
    JSON.stringify({
      msg: "tech_roster_load",
      ms: Date.now() - started,
      n: technicians.length,
    })
  );
  techRoster = technicians.map(mapTech);
  techRosterAt = Date.now();
  return techRoster;
}

function refreshTechnicianRoster() {
  if (techRosterLoading) return techRosterLoading;
  techRosterLoading = loadTechnicianRoster().finally(() => {
    techRosterLoading = null;
  });
  return techRosterLoading;
}

async function getSlimTechnicianRoster() {
  if (techRoster && Date.now() - techRosterAt < TECH_ROSTER_MAX_AGE_MS) {
    return techRoster;
  }
  // Never serve an expired roster while a refresh runs in the background —
  // that returned stale isActive and made reactivation look like it failed
  // after a page refresh.
  return refreshTechnicianRoster();
}

function invalidateTechnicianRoster() {
  techRosterGeneration += 1;
  techRoster = null;
  techRosterAt = 0;
  techRosterLoading = null;
}

function technicianRosterMap(roster) {
  const map = new Map();
  for (const tech of roster || []) {
    map.set(toId(tech._id), tech);
  }
  return map;
}

async function loadSourceRoster() {
  const sources = await Source.find({}).select("mainSourceName").lean();
  sourceRoster = sources.map((source) => ({
    _id: source._id,
    mainSourceName: source.mainSourceName,
  }));
  sourceRosterAt = Date.now();
  return sourceRoster;
}

async function getSourceRoster() {
  if (sourceRoster && Date.now() - sourceRosterAt < SOURCE_ROSTER_MAX_AGE_MS) {
    return sourceRoster;
  }
  if (sourceRosterLoading) return sourceRosterLoading;
  if (sourceRoster) {
    sourceRosterLoading = loadSourceRoster().finally(() => {
      sourceRosterLoading = null;
    });
    return sourceRoster;
  }
  sourceRosterLoading = loadSourceRoster().finally(() => {
    sourceRosterLoading = null;
  });
  return sourceRosterLoading;
}

function sourceRosterMap(roster) {
  const map = new Map();
  for (const source of roster || []) {
    map.set(toId(source._id), source);
  }
  return map;
}

async function warmAdminLookups() {
  await Promise.all([getSlimTechnicianRoster(), getSourceRoster()]);
}

module.exports = {
  getSlimTechnicianRoster,
  technicianRosterMap,
  getSourceRoster,
  sourceRosterMap,
  warmAdminLookups,
  invalidateTechnicianRoster,
  refreshTechnicianRoster,
  shrinkTechnicianDocuments,
  toId,
};
