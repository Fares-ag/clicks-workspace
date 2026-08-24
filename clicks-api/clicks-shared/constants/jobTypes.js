/**
 * Canonical job type catalog for Jobs and technician expertise.
 * New create-job UIs should use JOB_TYPES (+ JOB_TYPE_LABELS).
 * LEGACY values remain valid on existing Job documents / tech expertise.
 */

const JOB_TYPES = [
  "Towing",
  "Jump Start",
  "Flat Tire",
  "Tire Change",
  "Lock Out",
  "Fuel Delivery",
  "Battery Replacement",
  "Accident",
  "Overheating",
  "No Start",
  "Electrical",
  "Mechanical",
  "Gear Box",
  "Fuel Bump",
  "Body Work",
  "Car Wash",
];

const JOB_TYPE_LABELS = {
  Towing: "Towing",
  "Jump Start": "Jump Start",
  "Flat Tire": "Flat Tire",
  "Tire Change": "Tire Change",
  "Lock Out": "Lock Out",
  "Fuel Delivery": "Fuel Delivery",
  "Battery Replacement": "Battery Replacement",
  Accident: "Accident",
  Overheating: "Overheating",
  "No Start": "No Start",
  Electrical: "Electrical",
  Mechanical: "Mechanical",
  "Gear Box": "Gear Box",
  "Fuel Bump": "Fuel Bump",
  "Body Work": "Body Work",
  "Car Wash": "Car Wash",
};

/** Previous canonical strings — still valid on stored jobs. */
const PREVIOUS_JOB_TYPES = [
  "Jump start",
  "Flat tire",
  "Lockout",
  "Fuel delivery",
  "Battery replacement",
  "Accident assistance",
];

const LEGACY_JOB_TYPES = [
  ...PREVIOUS_JOB_TYPES,
  "Tires",
  "Engines",
  "Gearbox",
  "keyless_car_opening",
  "tire_change",
];

const LEGACY_JOB_TYPE_LABELS = {
  "Jump start": "Jump Start",
  "Flat tire": "Flat Tire",
  Lockout: "Lock Out",
  "Fuel delivery": "Fuel Delivery",
  "Battery replacement": "Battery Replacement",
  "Accident assistance": "Accident",
  Tires: "Tires (legacy)",
  Engines: "Engines (legacy)",
  Gearbox: "Gear Box (legacy)",
  keyless_car_opening: "Lock Out (legacy)",
  tire_change: "Tire Change (legacy)",
};

/** All values accepted by Job.jobType (new + legacy). */
const ALL_JOB_TYPES = [...JOB_TYPES, ...LEGACY_JOB_TYPES];

/** Expertise values: new catalog + legacy for existing techs and imports. */
const TECHNICIAN_EXPERTISE = [
  ...JOB_TYPES,
  "Tires",
  "Engines",
  "Gearbox",
];

function jobTypeLabel(jobType) {
  return (
    JOB_TYPE_LABELS[jobType] ||
    LEGACY_JOB_TYPE_LABELS[jobType] ||
    jobType
  );
}

module.exports = {
  JOB_TYPES,
  JOB_TYPE_LABELS,
  PREVIOUS_JOB_TYPES,
  LEGACY_JOB_TYPES,
  LEGACY_JOB_TYPE_LABELS,
  ALL_JOB_TYPES,
  TECHNICIAN_EXPERTISE,
  jobTypeLabel,
};
