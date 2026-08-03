/**
 * Canonical job type catalog for Jobs and technician expertise.
 * New create-job UIs should use JOB_TYPES (+ JOB_TYPE_LABELS).
 * LEGACY values remain valid on existing Job documents / tech expertise.
 */

const JOB_TYPES = [
  "Towing",
  "Jump start",
  "Flat tire",
  "Lockout",
  "Fuel delivery",
  "Battery replacement",
  "Accident assistance",
];

const JOB_TYPE_LABELS = {
  Towing: "Towing",
  "Jump start": "Jump start / Battery boost",
  "Flat tire": "Flat tire / Tire change",
  Lockout: "Lockout / Key locked in car",
  "Fuel delivery": "Fuel delivery",
  "Battery replacement": "Battery replacement",
  "Accident assistance": "Accident assistance",
};

const LEGACY_JOB_TYPES = [
  "Tires",
  "Engines",
  "Gearbox",
  "keyless_car_opening",
  "tire_change",
];

/** All values accepted by Job.jobType (new + legacy). */
const ALL_JOB_TYPES = [...JOB_TYPES, ...LEGACY_JOB_TYPES];

/** Expertise values: new RSA types + legacy Tires/Engines/Gearbox for existing techs. */
const TECHNICIAN_EXPERTISE = [
  ...JOB_TYPES,
  "Tires",
  "Engines",
  "Gearbox",
];

function jobTypeLabel(jobType) {
  return JOB_TYPE_LABELS[jobType] || jobType;
}

module.exports = {
  JOB_TYPES,
  JOB_TYPE_LABELS,
  LEGACY_JOB_TYPES,
  ALL_JOB_TYPES,
  TECHNICIAN_EXPERTISE,
  jobTypeLabel,
};
