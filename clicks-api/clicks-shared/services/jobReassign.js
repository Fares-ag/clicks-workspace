const axios = require("axios");
const Job = require("../models/Job");
const {
  JOB_REASSIGN_REASONS,
  JOB_REASSIGN_ALLOWED_STATUSES,
} = require("../constants/jobReassignReasons");
const { resolveTechnicianStatusAfterJob } = require("./jobHold");
const { setTechnicianStatus } = require("./technicianOnlineHours");
const { str } = require("../utils/coerce");

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function resetTechnicianPresence(technicianId, excludeJobId) {
  if (!technicianId) return;
  const nextStatus = await resolveTechnicianStatusAfterJob(technicianId, excludeJobId);
  await setTechnicianStatus(technicianId, nextStatus);
}

async function callInternalNotify(path, body) {
  const customerTechApiUrl =
    process.env.CUSTOMER_TECH_API_URL || "http://localhost:5001";
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    console.warn(`[reassign] skip ${path} — INTERNAL_API_SECRET not set`);
    return;
  }
  try {
    await axios.post(`${customerTechApiUrl}${path}`, body, {
      headers: { "x-internal-secret": secret },
      timeout: 15000,
    });
  } catch (err) {
    console.error(`[reassign] ${path} failed:`, err.message);
  }
}

/**
 * Move an active job from one technician to another (admin dispatch).
 */
async function reassignJob({
  jobId,
  technicianId,
  reason,
  reasonNote,
  adminId,
}) {
  const normalizedReason = str(reason, { maxLength: 64 }).trim();
  if (!JOB_REASSIGN_REASONS.includes(normalizedReason)) {
    throw httpError(
      400,
      `reason must be one of: ${JOB_REASSIGN_REASONS.join(", ")}`
    );
  }

  const toTechnicianId = str(technicianId, { maxLength: 32 }).trim();
  if (!toTechnicianId) {
    throw httpError(400, "technician_id is required");
  }

  const existing = await Job.findById(jobId).select(
    "assignedTechnician job_status on_hold_at"
  );
  if (!existing) {
    throw httpError(404, "Job not found");
  }

  const fromTechnicianId = existing.assignedTechnician
    ? String(existing.assignedTechnician)
    : "";
  if (!fromTechnicianId) {
    throw httpError(
      400,
      "Job has no assigned technician — assign one from Job Details instead"
    );
  }
  if (fromTechnicianId === toTechnicianId) {
    throw httpError(400, "Job is already assigned to this technician");
  }

  if (existing.job_status === "on_hold") {
    throw httpError(
      409,
      "Cannot reassign while the job is on hold — resume the job first"
    );
  }
  if (existing.job_status === "in_progress") {
    throw httpError(
      409,
      "Cannot reassign a job in progress — complete or cancel it first"
    );
  }
  if (existing.job_status === "completed" || existing.job_status === "cancelled") {
    throw httpError(409, `Cannot reassign a ${existing.job_status} job`);
  }
  if (!JOB_REASSIGN_ALLOWED_STATUSES.includes(existing.job_status)) {
    throw httpError(
      409,
      `Cannot reassign from status "${existing.job_status}"`
    );
  }

  const note = str(reasonNote, { maxLength: 500 }).trim();

  const updated = await Job.findOneAndUpdate(
    {
      _id: jobId,
      job_status: { $in: JOB_REASSIGN_ALLOWED_STATUSES },
      assignedTechnician: fromTechnicianId,
    },
    {
      $set: {
        assignedTechnician: toTechnicianId,
        assigned_at: new Date(),
        job_status: "assigned",
        accepted_at: null,
        en_route_at: null,
        arrived_at: null,
        started_at: null,
      },
      $push: {
        reassignment_history: {
          from_technician: fromTechnicianId,
          to_technician: toTechnicianId,
          reassigned_at: new Date(),
          reason: normalizedReason,
          reason_note: note,
          reassigned_by: adminId || null,
        },
      },
    },
    { new: true, runValidators: true }
  );

  if (!updated) {
    throw httpError(
      409,
      "Job was updated by someone else or is no longer eligible for reassignment"
    );
  }

  await resetTechnicianPresence(fromTechnicianId, jobId);

  await callInternalNotify("/api/sos/notify-job-reassigned", {
    job_id: String(jobId),
    previous_technician_id: fromTechnicianId,
    reason: normalizedReason,
  });

  await callInternalNotify("/api/sos/notify-technician", {
    job_id: String(jobId),
  });

  return {
    job: updated,
    fromTechnicianId,
    toTechnicianId,
    reason: normalizedReason,
    reasonNote: note,
  };
}

module.exports = {
  reassignJob,
  JOB_REASSIGN_ALLOWED_STATUSES,
};
