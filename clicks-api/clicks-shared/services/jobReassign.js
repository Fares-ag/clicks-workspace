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

/**
 * Admin API → tech API notify, through the outbox (5 s timeout, retried with
 * backoff; scenario 68). Never throws.
 */
async function callInternalNotify(path, body) {
  const { sendToTechApi } = require("./techApiNotify");
  return sendToTechApi(path, body);
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

/** Statuses a technician may hand back for re-dispatch (scenario 48). */
const TECHNICIAN_RELEASE_STATUSES = [
  "accepted",
  "en_route",
  "arrived",
  "in_progress",
];

/**
 * A technician who cannot finish (breakdown, accident) hands the job back.
 * The job returns to `pending` with no technician so dispatch can send
 * someone else; the SOS stays linked and the customer is not abandoned.
 * Conditional on the job still being this technician's and unpaid, so a
 * concurrent complete/payment/reassign wins cleanly.
 *
 * @returns {Promise<{ job: object, fromTechnicianId: string } | null>}
 *   null when the CAS missed (caller reports why).
 */
async function releaseJobForRedispatch({ jobId, technicianId, reason, note }) {
  const fromTechnicianId = str(technicianId, { maxLength: 32 }).trim();
  if (!fromTechnicianId) throw httpError(400, "technician id is required");

  const now = new Date();
  const updated = await Job.findOneAndUpdate(
    {
      _id: jobId,
      assignedTechnician: fromTechnicianId,
      job_status: { $in: TECHNICIAN_RELEASE_STATUSES },
      payment_status: { $ne: "paid" },
    },
    {
      $set: {
        job_status: "pending",
        assignedTechnician: null,
        assigned_at: null,
        accepted_at: null,
        en_route_at: null,
        arrived_at: null,
        started_at: null,
        rejection_description: str(note || reason, { maxLength: 500 }),
      },
      $push: {
        rejection_reasons: str(reason, { maxLength: 200 }) || "technician_cancelled",
        reassignment_history: {
          from_technician: fromTechnicianId,
          to_technician: null,
          reassigned_at: now,
          reason: "technician_cancelled",
          reason_note: str(note || reason, { maxLength: 500 }),
          reassigned_by: null,
        },
      },
    },
    { new: true }
  );
  if (!updated) return null;

  if (updated.sos_request_id) {
    const SOSRequest = require("../models/SOSRequest");
    await SOSRequest.updateOne(
      { _id: updated.sos_request_id, job_id: updated._id },
      { $set: { assigned_technician: null } }
    ).catch((err) => {
      console.error("[redispatch] SOS technician clear failed:", err.message);
    });
  }

  return { job: updated, fromTechnicianId, releasedAt: now };
}

module.exports = {
  reassignJob,
  releaseJobForRedispatch,
  callInternalNotify,
  JOB_REASSIGN_ALLOWED_STATUSES,
  TECHNICIAN_RELEASE_STATUSES,
};
