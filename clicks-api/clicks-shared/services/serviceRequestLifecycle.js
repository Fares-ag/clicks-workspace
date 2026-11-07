/**
 * ServiceRequest terminal states (WS-G, scenario 54).
 *
 * Before this, the only status ever written to a ServiceRequest was
 * "assigned", so every customer who booked once was stuck in the waiting
 * flow forever. The shared cancel and complete services call this when the
 * linked job reaches a terminal state.
 */
const Job = require("../models/Job");
const ServiceRequest = require("../models/ServiceRequest");

const TERMINAL = new Set(["completed", "cancelled"]);

function idOf(value) {
  if (value == null) return null;
  if (typeof value === "object" && value._id != null) return value._id;
  return value;
}

/**
 * Move the ServiceRequest linked to a job to `completed` or `cancelled`.
 * Conditional: a request that is already terminal is left alone, so a replay
 * (or a complete after a cancel) never flips it back.
 *
 * @param {object|string} jobOrId  a Job document/lean object, or its id
 * @param {"completed"|"cancelled"} status
 * @param {{ session?: import("mongoose").ClientSession, reason?: string }} [opts]
 * @returns {Promise<{ matched: number, modified: number }>}
 */
async function markServiceRequestForJob(jobOrId, status, { session, reason } = {}) {
  if (!TERMINAL.has(status)) {
    throw new Error(`markServiceRequestForJob: invalid status "${status}"`);
  }

  let jobId;
  let serviceRequestId = null;
  if (jobOrId && typeof jobOrId === "object" && jobOrId._id != null) {
    jobId = jobOrId._id;
    serviceRequestId = idOf(jobOrId.service_request_id);
  } else {
    jobId = jobOrId;
  }
  if (!jobId) return { matched: 0, modified: 0 };

  if (serviceRequestId == null) {
    const query = Job.findById(jobId).select("service_request_id").lean();
    if (session) query.session(session);
    const job = await query;
    serviceRequestId = idOf(job?.service_request_id);
  }

  const or = [{ job_id: jobId }];
  if (serviceRequestId) or.push({ _id: serviceRequestId });

  const now = new Date();
  const set = { status };
  if (status === "completed") set.completed_at = now;
  if (status === "cancelled") {
    set.cancelled_at = now;
    if (reason) set.cancel_reason = String(reason).slice(0, 500);
  }

  const result = await ServiceRequest.updateMany(
    { $or: or, status: { $nin: [...TERMINAL] } },
    { $set: set },
    session ? { session } : {}
  );
  return {
    matched: result.matchedCount ?? result.n ?? 0,
    modified: result.modifiedCount ?? result.nModified ?? 0,
  };
}

module.exports = { markServiceRequestForJob };
