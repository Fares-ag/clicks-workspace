/** Mirror of clicks-api/clicks-shared/constants/jobTypes.js for business portal web. */

export const JOB_TYPE_OPTIONS = [
  { value: "Towing", label: "Towing" },
  { value: "Jump Start", label: "Jump Start" },
  { value: "Flat Tire", label: "Flat Tire" },
  { value: "Tire Change", label: "Tire Change" },
  { value: "Lock Out", label: "Lock Out" },
  { value: "Fuel Delivery", label: "Fuel Delivery" },
  { value: "Battery Replacement", label: "Battery Replacement" },
  { value: "Accident", label: "Accident" },
  { value: "Overheating", label: "Overheating" },
  { value: "No Start", label: "No Start" },
  { value: "Electrical", label: "Electrical" },
  { value: "Mechanical", label: "Mechanical" },
  { value: "Gear Box", label: "Gear Box" },
  { value: "Fuel Bump", label: "Fuel Bump" },
  { value: "Body Work", label: "Body Work" },
  { value: "Car Wash", label: "Car Wash" },
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

export function jobTypeLabel(jobType) {
  if (!jobType) return "";
  const option = JOB_TYPE_OPTIONS.find((o) => o.value === jobType);
  if (option) return option.label;
  return LEGACY_JOB_TYPE_LABELS[jobType] || jobType;
}
