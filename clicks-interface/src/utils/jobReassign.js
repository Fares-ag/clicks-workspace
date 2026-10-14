/** Mirror of clicks-api/clicks-shared/constants/jobReassignReasons.js */

export const JOB_REASSIGN_ALLOWED_STATUSES = [
  "assigned",
  "accepted",
  "en_route",
  "arrived",
];

export const JOB_REASSIGN_REASONS = [
  { value: "technician_unavailable", label: "Technician unavailable" },
  { value: "vehicle_issue", label: "Vehicle or equipment issue" },
  { value: "customer_request", label: "Customer request" },
  { value: "dispatch_error", label: "Dispatch error" },
  { value: "other", label: "Other" },
];

export function jobReassignReasonLabel(code) {
  return JOB_REASSIGN_REASONS.find((r) => r.value === code)?.label || code;
}

export function canReassignJob(job) {
  if (!job?.assignedTechnician?._id && !job?.assignedTechnician) return false;
  if (job.job_status === "on_hold") return false;
  return JOB_REASSIGN_ALLOWED_STATUSES.includes(job.job_status);
}
