const JOB_REASSIGN_REASONS = [
  "technician_unavailable",
  "vehicle_issue",
  "customer_request",
  "dispatch_error",
  "other",
];

const JOB_REASSIGN_REASON_LABELS = {
  technician_unavailable: "Technician unavailable",
  vehicle_issue: "Vehicle or equipment issue",
  customer_request: "Customer request",
  dispatch_error: "Dispatch error",
  other: "Other",
};

/** Statuses where admin may move the job to another technician. */
const JOB_REASSIGN_ALLOWED_STATUSES = [
  "assigned",
  "accepted",
  "en_route",
  "arrived",
];

module.exports = {
  JOB_REASSIGN_REASONS,
  JOB_REASSIGN_REASON_LABELS,
  JOB_REASSIGN_ALLOWED_STATUSES,
};
