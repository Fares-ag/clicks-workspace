/**
 * Atomic SOS -> Job link (scenarios 42, 43, 44).
 *
 * The SOS is claimed for the new job FIRST, with a conditional update that
 * only matches while the SOS is still open, has no job, and is held by the
 * caller. Only then is the Job inserted, with the _id the SOS already points
 * at. Two dispatchers (or a double-click) racing on one SOS therefore produce
 * exactly one job; the loser gets a 409. A customer cancel that lands first
 * makes the CAS miss, so no truck is sent to a cancelled request.
 *
 * With a replica set both writes share one transaction. Without one (local
 * standalone Mongo) the same order is used and the SOS is reverted if the
 * insert fails, so a failed insert never leaves an SOS pointing at nothing.
 */
const mongoose = require("mongoose");
const Job = require("../models/Job");
const SOSRequest = require("../models/SOSRequest");
const { isReplicaSetTransactionError } = require("../utils/mongoTransactions");

function linkError(message, status, code, extra = {}) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  Object.assign(err, extra);
  return err;
}

function sosClaimFilter(sosId, adminId) {
  const base = { _id: sosId, job_id: null };
  if (!adminId) {
    return { ...base, status: { $in: ["pending", "in_call"] } };
  }
  // The dispatcher must hold the claim. An unclaimed pending SOS may be
  // converted directly; that counts as claiming it.
  return {
    ...base,
    $or: [
      { status: "in_call", claimed_by: adminId },
      { status: "pending", claimed_by: null },
    ],
  };
}

async function explainMiss(sosId, adminId) {
  const current = await SOSRequest.findById(sosId)
    .select("status job_id claimed_by")
    .lean();
  if (!current) {
    return linkError("SOS not found", 404, "SOS_NOT_FOUND");
  }
  if (current.job_id) {
    return linkError(
      "This SOS has already been handled — a job already exists for it",
      409,
      "SOS_ALREADY_HANDLED",
      { job_id: String(current.job_id) }
    );
  }
  if (!["pending", "in_call"].includes(current.status)) {
    return linkError(
      `This SOS is ${current.status} and can no longer be turned into a job`,
      409,
      current.status === "cancelled" ? "SOS_CANCELLED" : "SOS_UNAVAILABLE",
      { sos_status: current.status }
    );
  }
  if (
    adminId &&
    current.claimed_by &&
    String(current.claimed_by) !== String(adminId)
  ) {
    return linkError(
      "Another dispatcher holds this SOS",
      409,
      "SOS_CLAIMED_BY_OTHER",
      { claimed_by: String(current.claimed_by) }
    );
  }
  return linkError("This SOS is no longer available", 409, "SOS_UNAVAILABLE");
}

function linkUpdate(jobId, { adminId, assignedTechnician }) {
  const set = {
    status: "accepted",
    job_id: jobId,
    accepted_at: new Date(),
    outcome: "job_created",
    assigned_technician: assignedTechnician || null,
  };
  if (adminId) set.claimed_by = adminId;
  return { $set: set };
}

/**
 * @param {{ sosId: string, adminId?: string, jobData: object }} args
 * @returns {Promise<{ job: import("mongoose").Document }>}
 */
async function createJobLinkedToSos({ sosId, adminId, jobData }) {
  const jobId = new mongoose.Types.ObjectId();
  const filter = sosClaimFilter(sosId, adminId);
  const update = linkUpdate(jobId, {
    adminId,
    assignedTechnician: jobData.assignedTechnician,
  });
  const doc = { ...jobData, _id: jobId, sos_request_id: sosId };

  let session;
  try {
    session = await Job.db.startSession();
    let job;
    await session.withTransaction(async () => {
      const linked = await SOSRequest.findOneAndUpdate(filter, update, {
        new: true,
        session,
      });
      if (!linked) throw await explainMiss(sosId, adminId);
      [job] = await Job.create([doc], { session });
    });
    return { job };
  } catch (err) {
    if (!isReplicaSetTransactionError(err)) throw err;
  } finally {
    if (session) await session.endSession().catch(() => {});
  }

  // Standalone fallback: same order, compensating revert on insert failure.
  const prior = await SOSRequest.findOneAndUpdate(filter, update, { new: false });
  if (!prior) throw await explainMiss(sosId, adminId);
  try {
    const job = await Job.create(doc);
    return { job };
  } catch (insertErr) {
    await SOSRequest.updateOne(
      { _id: sosId, job_id: jobId },
      {
        $set: {
          status: prior.status,
          job_id: null,
          accepted_at: prior.accepted_at || null,
          outcome: prior.outcome || null,
          assigned_technician: prior.assigned_technician || null,
          claimed_by: prior.claimed_by || null,
        },
      }
    ).catch((revertErr) => {
      console.error("[linkSosToJob] revert failed:", revertErr.message);
    });
    throw insertErr;
  }
}

module.exports = { createJobLinkedToSos };
