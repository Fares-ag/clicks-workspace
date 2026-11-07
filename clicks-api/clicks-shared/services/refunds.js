const mongoose = require("mongoose");
const Refund = require("../models/Refund");
const PaymentAttempt = require("../models/PaymentAttempt");
const { addCreditNote, findJobReceipt } = require("./receipts");
const { alertOps, round2 } = require("./paymentAttempts");

const OPEN_STATUSES = ["requested", "processing"];
const EPSILON = 0.009;

function refundError(message, status = 400, code = "REFUND_INVALID") {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function sameId(a, b) {
  if (!a || !b) return false;
  return String(a._id || a) === String(b._id || b);
}

function normalizeActor(actor) {
  const a = actor && typeof actor === "object" ? actor : {};
  const id = a.id && mongoose.isValidObjectId(String(a.id)) ? String(a.id) : null;
  return {
    type: String(a.type || "system"),
    id,
    role: String(a.role || ""),
    name: String(a.name || ""),
  };
}

function models() {
  return {
    Job: require("../models/Job"),
    CustomerSubscription: require("../models/CustomerSubscription"),
  };
}

/** Did this attempt's capture pay the job (vs. a duplicate charge)? */
function attemptPaidJob(job, attempt) {
  if (!job || !attempt) return false;
  if (job.paid_attempt_id) return sameId(job.paid_attempt_id, attempt._id);
  return (
    job.payment_method === "card" &&
    String(job.skipcash?.payment_id || "") === String(attempt.provider_payment_id)
  );
}

async function openRefundTotal(filter) {
  const rows = await Refund.find({ ...filter, status: { $in: OPEN_STATUSES } }).select("amount").lean();
  return rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
}

async function paidAttemptFor({ jobId, subscriptionId, job }) {
  if (job?.paid_attempt_id) {
    const byJob = await PaymentAttempt.findById(job.paid_attempt_id);
    if (byJob) return byJob;
  }
  const filter = { status: { $in: ["paid", "partially_refunded"] } };
  if (jobId) filter.job_id = jobId;
  if (subscriptionId) filter.subscription_id = subscriptionId;
  // Prefer the capture that was actually applied; a duplicate must be named explicitly.
  const applied = await PaymentAttempt.findOne({
    ...filter,
    outcome: { $in: ["applied", "amount_mismatch", null] },
  }).sort({ createdAt: -1 });
  return applied || PaymentAttempt.findOne(filter).sort({ createdAt: -1 });
}

/**
 * Open a refund case. It does nothing at SkipCash until a different person
 * approves it (approveRefund).
 *
 * Called by: admin/finance refund endpoints, duplicate-capture handling,
 * paid-duplicate memberships, and (after merge) the dispatch cancel service.
 *
 * @param {{
 *   jobId?: string, subscriptionId?: string, amount?: number, reason: string,
 *   requestedBy?: { type: string, id?: string, role?: string, name?: string },
 *   source?: string, attemptId?: string
 * }} input — amount defaults to everything still refundable.
 * @returns {Promise<import("mongoose").Document>} the Refund
 */
async function requestRefund({
  jobId,
  subscriptionId,
  amount,
  reason,
  requestedBy,
  source,
  attemptId,
} = {}) {
  const { Job, CustomerSubscription } = models();
  if (!jobId && !subscriptionId) {
    throw refundError("jobId or subscriptionId is required", 400, "REFUND_TARGET_REQUIRED");
  }
  const why = String(reason || "").trim();
  if (!why) throw refundError("A refund reason is required", 400, "REFUND_REASON_REQUIRED");

  const kind = jobId ? "job" : "membership";
  let job = null;
  let sub = null;
  if (jobId) {
    if (!mongoose.isValidObjectId(String(jobId))) throw refundError("Job not found", 404, "JOB_NOT_FOUND");
    job = await Job.findById(jobId);
    if (!job) throw refundError("Job not found", 404, "JOB_NOT_FOUND");
  } else {
    if (!mongoose.isValidObjectId(String(subscriptionId))) {
      throw refundError("Membership not found", 404, "MEMBERSHIP_NOT_FOUND");
    }
    sub = await CustomerSubscription.findById(subscriptionId);
    if (!sub) throw refundError("Membership not found", 404, "MEMBERSHIP_NOT_FOUND");
  }

  let attempt = null;
  if (attemptId) {
    attempt = await PaymentAttempt.findById(attemptId);
    if (!attempt) throw refundError("Payment attempt not found", 404, "ATTEMPT_NOT_FOUND");
  } else {
    attempt = await paidAttemptFor({ jobId, subscriptionId, job });
  }
  if (attempt && !["paid", "partially_refunded"].includes(attempt.status)) {
    throw refundError("That payment was not captured", 409, "REFUND_NOT_CAPTURED");
  }

  // How much was taken, and how much of it is still not refunded / requested.
  let captured;
  let alreadyRefunded;
  if (attempt) {
    captured = Number(attempt.amount) || 0;
    alreadyRefunded = Number(attempt.refunded_amount) || 0;
  } else if (job) {
    if (!["paid", "partially_refunded"].includes(job.payment_status)) {
      throw refundError("This job has not been paid", 409, "REFUND_NOT_PAID");
    }
    const receipt = await findJobReceipt(job._id);
    captured = Number(job.paid_amount ?? receipt?.total_amount ?? job.price ?? 0);
    alreadyRefunded = Number(job.refunded_amount) || 0;
  } else {
    if (sub.comp) throw refundError("A complimentary membership has nothing to refund", 409, "REFUND_NOT_PAID");
    if (!sub.paid_at && sub.status === "pending_payment") {
      throw refundError("This membership has not been paid", 409, "REFUND_NOT_PAID");
    }
    captured = Number(sub.priceQar) || 0;
    alreadyRefunded = Number(sub.refunded_amount) || 0;
  }
  const openFilter = attempt
    ? { attempt_id: attempt._id }
    : job
      ? { job_id: job._id, attempt_id: null }
      : { subscription_id: sub._id, attempt_id: null };
  const refundable = round2(captured - alreadyRefunded - (await openRefundTotal(openFilter)));
  const value = amount == null || amount === "" ? refundable : round2(amount);
  if (!Number.isFinite(value) || value <= 0) {
    throw refundError(
      refundable <= 0 ? "Nothing left to refund on this payment" : "Refund amount must be greater than 0",
      refundable <= 0 ? 409 : 400,
      refundable <= 0 ? "REFUND_NOTHING_LEFT" : "REFUND_INVALID_AMOUNT"
    );
  }
  if (value - refundable > EPSILON) {
    throw refundError(
      `Refund cannot exceed the refundable QAR ${refundable.toFixed(2)}`,
      400,
      "REFUND_TOO_LARGE"
    );
  }

  return Refund.create({
    kind,
    job_id: job?._id || attempt?.job_id || null,
    subscription_id: sub?._id || attempt?.subscription_id || null,
    attempt_id: attempt?._id || null,
    customer_id: job?.customer_id || sub?.customer_id || attempt?.customer_id || null,
    amount: value,
    reason: why.slice(0, 1000),
    source: String(source || "admin"),
    method: attempt && attempt.provider === "skipcash" ? "provider" : "manual",
    status: "requested",
    requested_by: normalizeActor(requestedBy),
  });
}

/**
 * Move money/flags exactly once after a refund succeeded: the attempt's
 * refunded amount, the job's payment_status (only when this capture paid the
 * job — refunding a duplicate leaves the job paid), the receipt's credit note,
 * and the membership's refunded amount.
 */
async function applyRefundEffects(refundDoc) {
  const { Job, CustomerSubscription } = models();
  const refund = await Refund.findOneAndUpdate(
    { _id: refundDoc._id, status: "succeeded", effects_applied_at: null },
    { $set: { effects_applied_at: new Date() } },
    { new: true }
  );
  if (!refund) return Refund.findById(refundDoc._id);

  const amount = Number(refund.amount) || 0;
  let attempt = null;
  if (refund.attempt_id) {
    attempt = await PaymentAttempt.findById(refund.attempt_id);
    if (attempt) {
      const refunded = round2((Number(attempt.refunded_amount) || 0) + amount);
      const full = refunded >= (Number(attempt.amount) || 0) - EPSILON;
      await PaymentAttempt.updateOne(
        { _id: attempt._id },
        {
          $set: {
            refunded_amount: refunded,
            status: full ? "refunded" : "partially_refunded",
            ...(attempt.outcome === "applied" && full ? { outcome: "refunded" } : {}),
          },
          $push: {
            events: {
              $each: [
                {
                  source: "refund",
                  status: full ? "refunded" : "partially_refunded",
                  amount: amount.toFixed(2),
                  note: `refund ${refund._id}`,
                  at: new Date(),
                },
              ],
              $slice: -100,
            },
          },
        }
      );
    }
  }

  if (refund.kind === "job" && refund.job_id) {
    const job = await Job.findById(refund.job_id);
    if (job && (!attempt || attemptPaidJob(job, attempt))) {
      const receipt = await findJobReceipt(job._id);
      const paid = Number(job.paid_amount ?? receipt?.total_amount ?? job.price ?? 0);
      const refunded = round2((Number(job.refunded_amount) || 0) + amount);
      const full = refunded >= paid - EPSILON;
      await Job.updateOne(
        { _id: job._id },
        {
          $set: {
            refunded_amount: refunded,
            payment_status: full ? "refunded" : "partially_refunded",
          },
        }
      );
      const note = await addCreditNote({ jobId: job._id, refund, fullyRefunded: full });
      if (note?.creditNote?.number) {
        await Refund.updateOne(
          { _id: refund._id },
          { $set: { credit_note_number: note.creditNote.number } }
        );
      }
    }
  }

  if (refund.kind === "membership" && refund.subscription_id) {
    await CustomerSubscription.updateOne(
      { _id: refund.subscription_id },
      {
        $inc: { refunded_amount: amount },
        $push: {
          history: {
            action: "refunded",
            by_type: refund.approved_by?.type || "system",
            by_id: refund.approved_by?.id || null,
            note: refund.reason,
            data: { refund_id: refund._id, amount },
            at: new Date(),
          },
        },
      }
    );
  }
  return Refund.findById(refund._id);
}

/**
 * Approve and execute. The approver must not be the requester. Provider
 * refunds call SkipCash; on failure the case is `failed` and can be retried
 * or completed with a manual (portal) reference.
 *
 * @param {{ refundId: string, approvedBy: object, fetchImpl?: Function, manualReference?: string }} input
 */
async function approveRefund({ refundId, approvedBy, fetchImpl, manualReference } = {}) {
  if (!mongoose.isValidObjectId(String(refundId || ""))) {
    throw refundError("Refund not found", 404, "REFUND_NOT_FOUND");
  }
  const refund = await Refund.findById(refundId);
  if (!refund) throw refundError("Refund not found", 404, "REFUND_NOT_FOUND");
  const approver = normalizeActor(approvedBy);
  if (!approver.id) throw refundError("Approver is required", 403, "REFUND_APPROVER_REQUIRED");
  if (refund.requested_by?.id && sameId(refund.requested_by.id, approver.id)) {
    throw refundError(
      "A refund must be approved by someone other than the person who requested it",
      403,
      "REFUND_SAME_APPROVER"
    );
  }
  const reference = String(manualReference || "").trim();
  if (refund.method === "manual" && !reference) {
    throw refundError(
      "This payment was not taken by card: record the reference of the cash/portal refund",
      400,
      "REFUND_REFERENCE_REQUIRED"
    );
  }

  const claimed = await Refund.findOneAndUpdate(
    { _id: refund._id, status: { $in: ["requested", "failed"] } },
    {
      $set: {
        status: "processing",
        approved_by: approver,
        approved_at: new Date(),
        error: "",
      },
    },
    { new: true }
  );
  if (!claimed) {
    throw refundError(`Refund is already ${refund.status}`, 409, "REFUND_NOT_PENDING");
  }

  if (reference) {
    await Refund.updateOne(
      { _id: claimed._id },
      { $set: { status: "succeeded", manual_reference: reference.slice(0, 200), completed_at: new Date() } }
    );
    return applyRefundEffects(claimed);
  }

  const attempt = claimed.attempt_id ? await PaymentAttempt.findById(claimed.attempt_id) : null;
  if (!attempt) {
    await Refund.updateOne(
      { _id: claimed._id },
      { $set: { status: "failed", error: "No card payment to refund" } }
    );
    throw refundError("No card payment to refund", 409, "REFUND_NO_ATTEMPT");
  }

  try {
    const { refundPayment } = require("./skipcashClient");
    const result = await refundPayment(
      attempt.provider_payment_id,
      { amount: claimed.amount },
      { fetchImpl }
    );
    await Refund.updateOne(
      { _id: claimed._id },
      {
        $set: {
          status: "succeeded",
          provider_refund_id: result.refundId || "",
          provider_response: result.raw || null,
          completed_at: new Date(),
        },
      }
    );
    return applyRefundEffects(claimed);
  } catch (err) {
    await Refund.updateOne(
      { _id: claimed._id },
      {
        $set: {
          status: "failed",
          error: String(err.message || "SkipCash refund failed").slice(0, 500),
          provider_response: err.details || null,
        },
      }
    );
    alertOps("SkipCash refund failed", {
      refund_id: String(claimed._id),
      attempt_id: String(attempt._id),
      error: err.message,
    });
    const failed = await Refund.findById(claimed._id);
    const wrapped = refundError(
      `SkipCash refund failed: ${err.message}. Retry, or complete it in the SkipCash portal and record the reference.`,
      502,
      "REFUND_PROVIDER_FAILED"
    );
    wrapped.refund = failed;
    throw wrapped;
  }
}

async function rejectRefund({ refundId, rejectedBy, reason } = {}) {
  if (!mongoose.isValidObjectId(String(refundId || ""))) {
    throw refundError("Refund not found", 404, "REFUND_NOT_FOUND");
  }
  const updated = await Refund.findOneAndUpdate(
    { _id: refundId, status: { $in: ["requested", "failed"] } },
    {
      $set: {
        status: "rejected",
        rejected_by: normalizeActor(rejectedBy),
        rejection_reason: String(reason || "").trim().slice(0, 1000),
      },
    },
    { new: true }
  );
  if (!updated) {
    const current = await Refund.findById(refundId);
    if (!current) throw refundError("Refund not found", 404, "REFUND_NOT_FOUND");
    throw refundError(`Refund is already ${current.status}`, 409, "REFUND_NOT_PENDING");
  }
  return updated;
}

/**
 * SkipCash says a payment was refunded (StatusId 6). Confirms the refund we
 * executed, or — when finance refunded in the SkipCash portal without a case —
 * records one so Clicks' books match, and alerts.
 */
async function recordProviderRefund({ attempt, amount } = {}) {
  if (!attempt) return null;
  const open = await Refund.findOne({
    attempt_id: attempt._id,
    status: { $in: ["processing", "succeeded"] },
    provider_confirmed_at: null,
  }).sort({ createdAt: 1 });
  if (open) {
    await Refund.updateOne({ _id: open._id }, { $set: { provider_confirmed_at: new Date() } });
    if (open.status === "processing") {
      await Refund.updateOne(
        { _id: open._id, status: "processing" },
        { $set: { status: "succeeded", completed_at: new Date() } }
      );
    }
    return applyRefundEffects(open);
  }

  const fresh = await PaymentAttempt.findById(attempt._id);
  const remaining = round2((Number(fresh?.amount) || 0) - (Number(fresh?.refunded_amount) || 0));
  const value = round2(amount != null && amount !== "" ? Math.min(Number(amount), remaining) : remaining);
  if (!(value > 0)) return null; // already fully accounted for (repeated webhook)

  const created = await Refund.create({
    kind: attempt.kind,
    job_id: attempt.job_id,
    subscription_id: attempt.subscription_id,
    attempt_id: attempt._id,
    customer_id: attempt.customer_id,
    amount: value,
    reason: "Refunded at SkipCash (provider webhook) without a Clicks refund case",
    source: "provider",
    method: "provider",
    status: "succeeded",
    requested_by: { type: "provider" },
    approved_by: { type: "provider" },
    approved_at: new Date(),
    completed_at: new Date(),
    provider_confirmed_at: new Date(),
  });
  alertOps("Refund recorded from SkipCash webhook without approval in Clicks", {
    attempt_id: String(attempt._id),
    refund_id: String(created._id),
    amount: value,
  });
  return applyRefundEffects(created);
}

async function listRefunds({ status, jobId, subscriptionId, page = 1, limit = 50 } = {}) {
  const filter = {};
  if (status) filter.status = String(status);
  if (jobId && mongoose.isValidObjectId(String(jobId))) filter.job_id = jobId;
  if (subscriptionId && mongoose.isValidObjectId(String(subscriptionId))) {
    filter.subscription_id = subscriptionId;
  }
  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50));
  const safePage = Math.max(1, Number(page) || 1);
  const [refunds, total] = await Promise.all([
    Refund.find(filter)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),
    Refund.countDocuments(filter),
  ]);
  return { refunds, total, page: safePage, limit: safeLimit };
}

module.exports = {
  requestRefund,
  approveRefund,
  rejectRefund,
  recordProviderRefund,
  applyRefundEffects,
  listRefunds,
  attemptPaidJob,
  refundError,
};
