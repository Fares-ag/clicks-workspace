const Job = require("../models/Job");
const {
  HOLDABLE_JOB_STATUSES,
  TECH_BUSY_JOB_STATUSES,
} = require("../constants/jobStatuses");

const HOLD_REASON_MAX = 2000;

function holdError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function validateHoldReason(reason) {
  const trimmed = String(reason ?? "").trim();
  if (!trimmed) {
    throw holdError("Hold reason is required");
  }
  if (trimmed.length > HOLD_REASON_MAX) {
    throw holdError(`Hold reason must be ${HOLD_REASON_MAX} characters or fewer`);
  }
  return trimmed;
}

function parseScheduledReturnAt(value) {
  if (value == null || value === "") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw holdError("Invalid scheduled return date");
  }
  return d;
}

function sameId(a, b) {
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

/**
 * Put a job on hold. Requires a non-empty reason.
 * Does not change technician presence — caller should resolve after save.
 */
async function putJobOnHold(job, { reason, scheduledReturnAt, heldBy } = {}) {
  const holdReason = validateHoldReason(reason);
  if (!HOLDABLE_JOB_STATUSES.includes(job.job_status)) {
    throw holdError(`Cannot put job on hold from status: ${job.job_status}`);
  }
  if (job.payment_status === "paid") {
    throw holdError(
      "Cannot put a paid job on hold. Complete the job or request a refund."
    );
  }
  if (heldBy !== "admin" && heldBy !== "technician") {
    throw holdError("Only dispatch can put a job on hold");
  }

  const returnAt = parseScheduledReturnAt(scheduledReturnAt);

  job.status_before_hold = job.job_status;
  job.job_status = "on_hold";
  job.hold_reason = holdReason;
  job.on_hold_at = new Date();
  job.held_by = heldBy || undefined;
  job.scheduled_return_at = returnAt;
  job.resumed_at = null;
  await job.save();
  return job;
}

/**
 * Technician requests hold — job status unchanged until admin approves.
 */
async function requestJobHold(job, { reason, technicianId } = {}) {
  const holdReason = validateHoldReason(reason);
  if (!HOLDABLE_JOB_STATUSES.includes(job.job_status)) {
    throw holdError(`Cannot request hold from status: ${job.job_status}`);
  }
  if (job.payment_status === "paid") {
    throw holdError(
      "Cannot request hold on a paid job. Complete the job or contact dispatch."
    );
  }
  if (!sameId(job.assignedTechnician, technicianId)) {
    throw holdError("Forbidden", 403);
  }
  if (job.hold_request?.status === "pending") {
    throw holdError("A hold request is already pending for this job", 409);
  }

  job.hold_request = {
    status: "pending",
    reason: holdReason,
    requested_at: new Date(),
    requested_by: technicianId,
    decided_at: null,
    decided_by: null,
    decision_note: "",
  };
  await job.save();
  return job;
}

/**
 * Admin approves a pending hold request — applies on_hold using the tech reason.
 */
async function approveHoldRequest(job, { adminId, scheduledReturnAt } = {}) {
  if (job.hold_request?.status !== "pending") {
    throw holdError("No pending hold request to approve", 409);
  }
  const reason = job.hold_request.reason;
  await putJobOnHold(job, {
    reason,
    scheduledReturnAt,
    heldBy: "technician",
  });
  job.hold_request.status = "approved";
  job.hold_request.decided_at = new Date();
  job.hold_request.decided_by = adminId;
  await job.save();
  return job;
}

/**
 * Admin rejects a pending hold request — job stays on fulfill path.
 */
async function rejectHoldRequest(job, { adminId, note } = {}) {
  if (job.hold_request?.status !== "pending") {
    throw holdError("No pending hold request to reject", 409);
  }
  job.hold_request.status = "rejected";
  job.hold_request.decided_at = new Date();
  job.hold_request.decided_by = adminId;
  job.hold_request.decision_note = String(note ?? "").trim();
  await job.save();
  return job;
}

/**
 * Technician cancels their own pending hold request.
 */
async function cancelHoldRequest(job, { technicianId } = {}) {
  if (job.hold_request?.status !== "pending") {
    throw holdError("No pending hold request to cancel", 409);
  }
  if (!sameId(job.assignedTechnician, technicianId)) {
    throw holdError("Forbidden", 403);
  }
  job.hold_request = {
    status: null,
    reason: "",
    requested_at: null,
    requested_by: null,
    decided_at: null,
    decided_by: null,
    decision_note: "",
  };
  await job.save();
  return job;
}

/** Clear pending request when admin puts job on hold directly. */
function clearPendingHoldRequest(job, { adminId } = {}) {
  if (job.hold_request?.status !== "pending") return;
  job.hold_request.status = "approved";
  job.hold_request.decided_at = new Date();
  job.hold_request.decided_by = adminId;
  job.hold_request.decision_note = "Superseded by direct hold";
}

/**
 * Resume a held job to status_before_hold. Hold reason is kept for audit.
 */
async function resumeJobFromHold(job) {
  if (job.job_status !== "on_hold") {
    throw holdError(`Cannot resume job with status: ${job.job_status}`);
  }
  const prior = job.status_before_hold;
  if (!HOLDABLE_JOB_STATUSES.includes(prior)) {
    throw holdError("Cannot resume: missing original job status");
  }
  job.job_status = prior;
  job.resumed_at = new Date();
  await job.save();
  return job;
}

/**
 * Presence after a job leaves the busy set (hold / complete / cancel).
 * on_hold is not busy, so a technician with only held jobs goes Online.
 */
async function resolveTechnicianStatusAfterJob(technicianId, excludeJobId) {
  const stillBusy = await Job.exists({
    assignedTechnician: technicianId,
    _id: { $ne: excludeJobId },
    job_status: { $in: TECH_BUSY_JOB_STATUSES },
  });
  return stillBusy ? "On Job" : "Online";
}

const resolveTechnicianPresenceAfterHoldChange = resolveTechnicianStatusAfterJob;

module.exports = {
  HOLD_REASON_MAX,
  holdError,
  validateHoldReason,
  parseScheduledReturnAt,
  putJobOnHold,
  requestJobHold,
  approveHoldRequest,
  rejectHoldRequest,
  cancelHoldRequest,
  clearPendingHoldRequest,
  resumeJobFromHold,
  resolveTechnicianStatusAfterJob,
  resolveTechnicianPresenceAfterHoldChange,
};
