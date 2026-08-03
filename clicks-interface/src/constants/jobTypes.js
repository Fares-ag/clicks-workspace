/** Mirror of clicks-api/clicks-shared/constants/jobTypes.js for admin UI. */

export const JOB_TYPES = [
  "Towing",
  "Jump start",
  "Flat tire",
  "Lockout",
  "Fuel delivery",
  "Battery replacement",
  "Accident assistance",
];

export const JOB_TYPE_LABELS = {
  Towing: "Towing",
  "Jump start": "Jump start / Battery boost",
  "Flat tire": "Flat tire / Tire change",
  Lockout: "Lockout / Key locked in car",
  "Fuel delivery": "Fuel delivery",
  "Battery replacement": "Battery replacement",
  "Accident assistance": "Accident assistance",
};

export const LEGACY_JOB_TYPES = [
  "Tires",
  "Engines",
  "Gearbox",
  "keyless_car_opening",
  "tire_change",
];

export const ALL_JOB_TYPES = [...JOB_TYPES, ...LEGACY_JOB_TYPES];

/** Expertise options for create/edit technician (new RSA types). */
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

/** Identity map for filtering technicians by expertise matching job type. */
export const JOB_TYPE_MAPPING = {
  ...Object.fromEntries(JOB_TYPES.map((t) => [t, t])),
  Tires: "Tires",
  Engines: "Engines",
  Gearbox: "Gearbox",
  tire_change: "Tires",
  keyless_car_opening: "Lockout",
};

export const HEATMAP_JOB_TYPES = [
  ...JOB_TYPES.map((value) => ({
    value,
    label: JOB_TYPE_LABELS[value] || value,
  })),
  { value: "Tires", label: "Tires (legacy)" },
  { value: "Engines", label: "Engines (legacy)" },
  { value: "Gearbox", label: "Gearbox (legacy)" },
  { value: "keyless_car_opening", label: "Keyless opening (legacy)" },
  { value: "tire_change", label: "Tire change (legacy)" },
];

export function jobTypeLabel(jobType) {
  return JOB_TYPE_LABELS[jobType] || jobType;
}
