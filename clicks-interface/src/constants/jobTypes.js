/** Mirror of clicks-api/clicks-shared/constants/jobTypes.js for admin UI. */

export const JOB_TYPES = [
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

export const JOB_TYPE_LABELS = {
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

export const PREVIOUS_JOB_TYPES = [
  "Jump start",
  "Flat tire",
  "Lockout",
  "Fuel delivery",
  "Battery replacement",
  "Accident assistance",
];

export const LEGACY_JOB_TYPES = [
  ...PREVIOUS_JOB_TYPES,
  "Tires",
  "Engines",
  "Gearbox",
  "keyless_car_opening",
  "tire_change",
];

export const LEGACY_JOB_TYPE_LABELS = {
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

export const ALL_JOB_TYPES = [...JOB_TYPES, ...LEGACY_JOB_TYPES];

/** Acceptable expertise strings when matching technicians to a job type. */
export const JOB_TYPE_EXPERTISE_ALIASES = {
  Towing: ["Towing"],
  "Jump Start": ["Jump Start", "Jump start"],
  "Flat Tire": ["Flat Tire", "Flat tire", "Tires"],
  "Tire Change": ["Tire Change", "tire_change"],
  "Lock Out": ["Lock Out", "Lockout", "keyless_car_opening"],
  "Fuel Delivery": ["Fuel Delivery", "Fuel delivery"],
  "Battery Replacement": ["Battery Replacement", "Battery replacement"],
  Accident: ["Accident", "Accident assistance"],
  Overheating: ["Overheating"],
  "No Start": ["No Start"],
  Electrical: ["Electrical"],
  Mechanical: ["Mechanical", "Engines"],
  "Gear Box": ["Gear Box", "Gearbox"],
  "Fuel Bump": ["Fuel Bump"],
  "Body Work": ["Body Work"],
  "Car Wash": ["Car Wash"],
  "Jump start": ["Jump Start", "Jump start"],
  "Flat tire": ["Flat Tire", "Flat tire", "Tires"],
  Lockout: ["Lock Out", "Lockout", "keyless_car_opening"],
  "Fuel delivery": ["Fuel Delivery", "Fuel delivery"],
  "Battery replacement": ["Battery Replacement", "Battery replacement"],
  "Accident assistance": ["Accident", "Accident assistance"],
  Tires: ["Flat Tire", "Flat tire", "Tires"],
  Engines: ["Mechanical", "Engines"],
  Gearbox: ["Gear Box", "Gearbox"],
  keyless_car_opening: ["Lock Out", "Lockout", "keyless_car_opening"],
  tire_change: ["Tire Change", "tire_change"],
};

/** Expertise options for create/edit technician (new catalog). */
export const TECHNICIAN_EXPERTISE_OPTIONS = JOB_TYPES.map((value) => ({
  value,
  label: JOB_TYPE_LABELS[value] || value,
}));

/** Create-job dropdown options: value = stored jobType, expertise = same string. */
export const JOB_TYPE_OPTIONS = JOB_TYPES.map((value) => ({
  value,
  label: JOB_TYPE_LABELS[value] || value,
  expertise: value,
}));

/**
 * @deprecated Use matchesJobTypeExpertise — kept for any stale imports.
 */
export const JOB_TYPE_MAPPING = Object.fromEntries(
  [...JOB_TYPES, ...LEGACY_JOB_TYPES].map((t) => [t, t])
);

export const HEATMAP_JOB_TYPES = [
  ...JOB_TYPES.map((value) => ({
    value,
    label: JOB_TYPE_LABELS[value] || value,
  })),
  ...PREVIOUS_JOB_TYPES.map((value) => ({
    value,
    label: LEGACY_JOB_TYPE_LABELS[value] || value,
  })),
  { value: "Tires", label: LEGACY_JOB_TYPE_LABELS.Tires },
  { value: "Engines", label: LEGACY_JOB_TYPE_LABELS.Engines },
  { value: "Gearbox", label: LEGACY_JOB_TYPE_LABELS.Gearbox },
  { value: "keyless_car_opening", label: LEGACY_JOB_TYPE_LABELS.keyless_car_opening },
  { value: "tire_change", label: LEGACY_JOB_TYPE_LABELS.tire_change },
];

export function jobTypeLabel(jobType) {
  return (
    JOB_TYPE_LABELS[jobType] ||
    LEGACY_JOB_TYPE_LABELS[jobType] ||
    jobType
  );
}

export function matchesJobTypeExpertise(jobType, techExpertise) {
  if (!jobType) return true;
  const aliases = JOB_TYPE_EXPERTISE_ALIASES[jobType];
  const expertise = techExpertise || [];
  if (!aliases) return expertise.includes(jobType);
  return aliases.some((alias) => expertise.includes(alias));
}
