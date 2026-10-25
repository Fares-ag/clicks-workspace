const { normalizeJobVehicle } = require("./normalizeJobVehicle");
const { normalizeJobIssue } = require("./normalizeJobIssue");
const { normalizeJobType } = require("./normalizeJobType");
const { normalizePlate } = require("./normalizePlate");

const ISSUE_WRITE_MIN = 0.72;
const VEHICLE_WRITE_MIN = 0.65;

/**
 * Mutates a job/lead-like object so high-confidence canonical values are
 * written back. Leaves unmatched free text alone.
 */
function applyCanonicalJobFields(doc, extraAliases = []) {
  if (!doc || typeof doc !== "object") return doc;

  const vehicle = normalizeJobVehicle({
    make: doc.vehicleMake,
    model: doc.vehicleModel,
    year: doc.vehicleYear,
  });
  if (vehicle.canonicalMake && vehicle.confidence >= VEHICLE_WRITE_MIN) {
    doc.vehicleMake = vehicle.canonicalMake;
    if (vehicle.canonicalModel) doc.vehicleModel = vehicle.canonicalModel;
    if (vehicle.canonicalYear != null) doc.vehicleYear = vehicle.canonicalYear;
  }

  const issue = normalizeJobIssue(doc.issue, doc.jobType, extraAliases);
  if (
    issue.canonicalIssueId !== "unmapped" &&
    issue.confidence >= ISSUE_WRITE_MIN
  ) {
    doc.issue = issue.canonicalIssueLabel;
  }

  const type = normalizeJobType(doc.jobType, issue);
  if (type.canonicalJobType && (type.method === "exact" || type.method === "legacy" || type.method === "issueDerived")) {
    doc.jobType = type.canonicalJobType;
  }

  if (doc.licensePlate) {
    const plate = normalizePlate(doc.licensePlate);
    if (plate.canonicalPlate) doc.licensePlate = plate.canonicalPlate;
  }

  return doc;
}

module.exports = {
  applyCanonicalJobFields,
  ISSUE_WRITE_MIN,
  VEHICLE_WRITE_MIN,
};
