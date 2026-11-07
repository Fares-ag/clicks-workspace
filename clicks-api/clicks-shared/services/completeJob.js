const Job = require("../models/Job");
const RepairProcedure = require("../models/RepairProcedure");
const { computeJobPricing } = require("../utils/jobPricing");
const {
  completionCasMissError,
  isCompletionCasMiss,
  isReplicaSetTransactionError,
} = require("../utils/mongoTransactions");
const { creditTechnicianForJob } = require("./technicianCredit");
const { consumeOnComplete } = require("./membershipEntitlement");
const { issueJobReceipt } = require("./receipts");
const {
  enqueueOutboxEvent,
  runOutboxEventNow,
  OUTBOX_TYPES,
} = require("./outboxWorker");
const { invalidateTechSessionCache } = require("./jobPayment");

const PAID_STATUSES = ["paid", "partially_refunded", "refunded"];

let loggedTransactionFallback = false;

/**
 * The one way a job becomes `completed` — technician markCompleted and admin
 * completeJob both call this, so the money side can never differ by path:
 *
 *  - CAS on job_status (only from `fromStatuses`), so a double tap or a
 *    technician/admin race completes once.
 *  - Nothing to pay (membership-covered or zero total) → paid, with
 *    payment_method "membership" (or "waived"), paid_amount 0; the technician
 *    is owed no cash for it.
 *  - Technician credit, receipt (when paid), membership consumption
 *    (reservation → used) and the partner-accrual outbox row are written in
 *    one transaction. Partner accrual is then attempted immediately; if it
 *    fails, the outbox worker retries it.
 *
 * Validation that differs by caller (signature, job reference, payment
 * collected) stays in the controllers.
 *
 * @param {{
 *   jobId: string,
 *   fromStatuses: string[],
 *   set?: object,          — extra fields written with the completion
 * }} input
 * @returns {Promise<{ job: object, receipt: object|null, pricing: object, zeroDue: boolean, partnerEventId: any }>}
 * @throws completionCasMissError when the job was not in an allowed status
 */
async function completeJob({ jobId, fromStatuses, set = {} } = {}) {
  if (!Array.isArray(fromStatuses) || !fromStatuses.length) {
    throw new Error("completeJob requires fromStatuses");
  }
  const job = await Job.findById(jobId);
  if (!job) throw completionCasMissError();

  const repairs = await RepairProcedure.find({ job_id: job._id });
  const pricing = computeJobPricing(job, repairs);
  const zeroDue = Number(pricing.total || 0) <= 0;
  const now = new Date();

  const completionSet = {
    ...set,
    job_status: "completed",
    completed_at: now,
    price_locked: false,
  };
  if (zeroDue && !PAID_STATUSES.includes(job.payment_status)) {
    const coveredByPlan =
      job.membership && job.membership.cover && job.membership.cover !== "none";
    completionSet.payment_status = "paid";
    completionSet.paid_at = now;
    completionSet.payment_method = coveredByPlan ? "membership" : "waived";
    completionSet.paid_amount = 0;
  }

  const moneyPath = async (session) => {
    const opts = session ? { new: true, session } : { new: true };
    const updated = await Job.findOneAndUpdate(
      { _id: job._id, job_status: { $in: fromStatuses } },
      { $set: completionSet },
      opts
    );
    if (!updated) throw completionCasMissError();

    // Receipt before credit: the cash a technician owes is read from it.
    const receipt = PAID_STATUSES.includes(updated.payment_status)
      ? await issueJobReceipt(updated, { session })
      : null;
    await creditTechnicianForJob(updated, session ? { session } : {});
    await consumeOnComplete(updated, { session });
    const partnerEvent = await enqueueOutboxEvent(
      OUTBOX_TYPES.PARTNER_ACCRUAL,
      { job_id: updated._id.toString() },
      { session }
    );
    return { updated, receipt, partnerEventId: partnerEvent?._id };
  };

  let result;
  const session = await Job.db.startSession();
  try {
    await session.withTransaction(async () => {
      result = await moneyPath(session);
    });
  } catch (txnErr) {
    if (isCompletionCasMiss(txnErr) || !isReplicaSetTransactionError(txnErr)) throw txnErr;
    if (!loggedTransactionFallback) {
      loggedTransactionFallback = true;
      console.warn(
        JSON.stringify({
          level: "warn",
          msg: "completion_transaction_unavailable",
          detail: txnErr.message,
          fallback: "non_transactional",
        })
      );
    }
    result = await completeWithoutTransaction(job._id, fromStatuses, completionSet);
  } finally {
    await session.endSession();
  }

  if (result.partnerEventId) {
    await runOutboxEventNow(result.partnerEventId).catch((err) => {
      console.error("Partner accrual outbox run failed:", err.message);
    });
  }

  // A scheduled booking's ServiceRequest ends with its job (scenario 54).
  // Best effort: the booking guard also heals stale rows on read.
  await require("./serviceRequestLifecycle")
    .markServiceRequestForJob(result.updated, "completed")
    .catch((err) => {
      console.error("[completeJob] service request terminal write failed:", err.message);
    });

  invalidateTechSessionCache(result.updated.assignedTechnician);
  return {
    job: result.updated,
    receipt: result.receipt,
    pricing,
    zeroDue,
    partnerEventId: result.partnerEventId,
  };
}

/** Standalone Mongo: sequential writes; credit retried through the outbox. */
async function completeWithoutTransaction(jobId, fromStatuses, completionSet) {
  const updated = await Job.findOneAndUpdate(
    { _id: jobId, job_status: { $in: fromStatuses } },
    { $set: completionSet },
    { new: true }
  );
  if (!updated) throw completionCasMissError();

  const receipt = PAID_STATUSES.includes(updated.payment_status)
    ? await issueJobReceipt(updated)
    : null;
  try {
    await creditTechnicianForJob(updated);
  } catch (creditErr) {
    console.error("Technician credit failed:", creditErr.message);
    await enqueueOutboxEvent(OUTBOX_TYPES.TECHNICIAN_CREDIT, {
      job_id: updated._id.toString(),
    }).catch((outboxErr) => {
      console.error("Failed to enqueue technician credit outbox:", outboxErr.message);
    });
  }
  try {
    await consumeOnComplete(updated);
  } catch (membershipErr) {
    console.error("Membership consume failed:", membershipErr.message);
  }
  let partnerEventId = null;
  try {
    const event = await enqueueOutboxEvent(OUTBOX_TYPES.PARTNER_ACCRUAL, {
      job_id: updated._id.toString(),
    });
    partnerEventId = event._id;
  } catch (outboxErr) {
    console.error("Failed to enqueue partner accrual outbox:", outboxErr.message);
  }
  return { updated, receipt, partnerEventId };
}

module.exports = {
  completeJob,
  isCompletionCasMiss,
};
