const Job = require("../models/Job");
const RepairProcedure = require("../models/RepairProcedure");
const PaymentAttempt = require("../models/PaymentAttempt");
const { computeJobPricing } = require("../utils/jobPricing");
const { formatAmount, amountsMatch, isRefundedStatus, isRefundFailedStatus, isPendingRefundStatus } = require("../utils/skipcash");
const { deletePayloadCacheKey } = require("../utils/payloadCache");
const { issueJobReceipt, findJobReceipt } = require("./receipts");
const {
  recordProviderResult,
  claimOutcome,
  cancelAttemptLocally,
  pendingAttempts,
  alertOps,
  round2,
} = require("./paymentAttempts");

const PAID_STATUSES = ["paid", "partially_refunded", "refunded"];
const MANUAL_METHODS = ["cash", "card", "wallet", "fawran", "waived"];
const RECONCILE_MAX_AGE_MS = 48 * 60 * 60 * 1000;

function invalidateTechSessionCache(technicianId) {
  if (!technicianId) return;
  deletePayloadCacheKey(`clicks:tech:payload:session:${technicianId}`).catch(() => {});
}

function isJobPaid(job) {
  return PAID_STATUSES.includes(job?.payment_status);
}

async function priceJob(job, session = null) {
  const q = RepairProcedure.find({ job_id: job._id });
  if (session) q.session(session);
  const repairs = await q;
  return computeJobPricing(job, repairs);
}

/** Customer-facing price breakdown for app payloads: what will be charged. */
function pricingPayload(job, repairs) {
  const list = Array.isArray(repairs) ? repairs : [];
  const p = computeJobPricing(job, list);
  // Same job without membership: the undiscounted sum the discount is taken from.
  const raw = computeJobPricing({ ...(job?.toObject?.() || job || {}), membership: null }, list);
  return {
    base: round2(job?.price || 0),
    repairs: list.map((r) => ({
      id: r._id ? String(r._id) : undefined,
      description: r.description || r.name || "",
      quantity: Number(r.quantity) || 1,
      price: round2(r.price),
      amount: round2((Number(r.price) || 0) * (Number(r.quantity) || 1)),
    })),
    distance_fee: round2(raw.distanceFee),
    discount: round2(raw.total - p.total),
    subtotal: round2(raw.total),
    total: round2(p.total),
    currency: "QAR",
    membership: p.membership || null,
    price_locked: Boolean(job?.price_locked),
  };
}

async function jobPricingPayload(job) {
  if (!job?._id) return null;
  const repairs = await RepairProcedure.find({ job_id: job._id }).sort({ created_at: 1 }).lean();
  return pricingPayload(job, repairs);
}

/**
 * Mark a job paid exactly once (conditional on it still being unpaid), issue
 * its receipt, and tell the customer. Every payment path goes through here:
 * SkipCash capture, technician cash, finance/admin mark-paid.
 */
async function applyJobPayment(
  job,
  {
    paymentMethod = "card",
    notes,
    skipcash,
    notify,
    attempt,
    flags,
    reference,
    paidBy,
    paidAmount,
  } = {}
) {
  if (!job) return { alreadyPaid: false, job: null, receipt: null };
  if (isJobPaid(job)) {
    return { alreadyPaid: true, job, receipt: await findJobReceipt(job._id) };
  }

  const pricing = await priceJob(job);
  const set = {
    payment_status: "paid",
    paid_at: new Date(),
    payment_method: paymentMethod,
    paid_amount: round2(paidAmount != null ? paidAmount : pricing.total),
    price_locked: false,
  };
  if (attempt?._id) set.paid_attempt_id = attempt._id;
  if (reference) set.payment_reference = String(reference).slice(0, 200);
  if (paidBy?.type) {
    set["paid_by.type"] = paidBy.type;
    if (paidBy.id) set["paid_by.id"] = paidBy.id;
  }
  if (flags?.amount_mismatch) set["payment_flags.amount_mismatch"] = true;
  if (skipcash && typeof skipcash === "object") {
    for (const key of ["payment_id", "pay_url", "transaction_id", "status_id", "visa_id", "amount"]) {
      if (skipcash[key] != null) set[`skipcash.${key}`] = skipcash[key];
    }
  }

  const updated = await Job.findOneAndUpdate(
    { _id: job._id, payment_status: { $nin: PAID_STATUSES } },
    { $set: set },
    { new: true }
  );
  if (!updated) {
    const fresh = await Job.findById(job._id);
    return { alreadyPaid: true, job: fresh, receipt: await findJobReceipt(job._id) };
  }

  invalidateTechSessionCache(updated.assignedTechnician);
  const receipt = await issueJobReceipt(updated, { notes });

  if (updated.customer_id && typeof notify === "function") {
    try {
      await notify(updated.customer_id.toString(), "paymentConfirmed", {
        job_id: updated._id.toString(),
        job_status: updated.job_status,
        payment_status: "paid",
        payment_method: updated.payment_method,
        total_amount: pricing.total,
        // What was actually taken (0 for a waiver), shown in the push copy.
        amount: updated.paid_amount ?? pricing.total,
        // notifyCustomer dedupe key: one "paid" notification per payment.
        paid_at: updated.paid_at,
      });
    } catch (err) {
      console.error("paymentConfirmed notify failed:", err.message);
    }
  }

  return { alreadyPaid: false, job: updated, receipt, pricing };
}

/** Unfreeze repairs/price when no checkout is pending any more. */
async function refreshPriceLock(jobId) {
  const pending = await PaymentAttempt.exists({ job_id: jobId, status: "pending" });
  if (!pending) {
    await Job.updateOne({ _id: jobId, price_locked: true }, { $set: { price_locked: false } });
    return false;
  }
  return true;
}

/** Repairs/price may change only when no card checkout is in flight. */
async function isPriceLocked(job) {
  if (!job?.price_locked) return false;
  return refreshPriceLock(job._id);
}

/**
 * Record a SkipCash result (webhook, poll, sweep) for a job attempt and act on it.
 * - captured, job unpaid → apply (flag amount_mismatch if the total moved; never reject)
 * - captured, job already paid by something else → duplicate_capture + refund case + alert
 * - refunded (6) → refund service confirms / records it
 * - failed/cancelled → recorded; the job is never downgraded
 */
async function settleJobAttempt(
  attempt,
  { source = "webhook", statusId, amount, transactionId, visaId, payUrl, notify } = {}
) {
  const recorded = await recordProviderResult(attempt, {
    source,
    statusId,
    amount,
    transactionId,
    visaId,
    payUrl,
  });
  const att = recorded.attempt;

  if (isRefundFailedStatus(statusId)) {
    const { recordProviderRefundFailed } = require("./refunds");
    const refund = await recordProviderRefundFailed({ attempt: att });
    return { state: "refund_failed", attempt: att, refund };
  }
  if (isPendingRefundStatus(statusId)) {
    // A refund we submitted is still settling at SkipCash; nothing to apply.
    return { state: "refund_pending", attempt: att };
  }
  if (isRefundedStatus(statusId)) {
    const { recordProviderRefund } = require("./refunds");
    const refund = await recordProviderRefund({ attempt: att, amount });
    return { state: "refunded", attempt: att, refund };
  }
  if (att.status !== "paid") {
    if (["failed", "cancelled"].includes(att.status) && att.job_id) {
      await refreshPriceLock(att.job_id);
    }
    return { state: att.status, attempt: att };
  }

  const job = att.job_id ? await Job.findById(att.job_id) : null;
  const captured = round2(amount != null && amount !== "" ? amount : att.amount);
  const snapshot = {
    payment_id: att.provider_payment_id,
    pay_url: att.pay_url || undefined,
    transaction_id: transactionId || att.transaction_id || undefined,
    status_id: 2,
    visa_id: visaId || att.visa_id || undefined,
    amount: formatAmount(captured) || String(captured),
  };

  let expected = null;
  if (job && !isJobPaid(job)) {
    const pricing = await priceJob(job);
    expected = round2(pricing.total);
    const mismatch = !amountsMatch(captured, expected);
    const applied = await applyJobPayment(job, {
      paymentMethod: "card",
      notes: "SkipCash card payment",
      skipcash: snapshot,
      attempt: att,
      flags: { amount_mismatch: mismatch },
      paidAmount: captured,
      notify,
    });
    if (!applied.alreadyPaid) {
      const outcome = mismatch ? "amount_mismatch" : "applied";
      await claimOutcome(att._id, outcome, { expected_amount: expected });
      if (mismatch) {
        alertOps("SkipCash capture differs from the job total — applied, needs finance review", {
          job_id: String(job._id),
          attempt_id: String(att._id),
          captured,
          expected,
        });
      }
      return { state: "paid", applied: true, outcome, attempt: att, job: applied.job, receipt: applied.receipt };
    }
  }

  // The job was already settled. Was it settled by this very capture?
  const fresh = job ? await Job.findById(job._id) : null;
  const { attemptPaidJob } = require("./refunds");
  if (fresh && attemptPaidJob(fresh, att)) {
    await claimOutcome(att._id, "applied", {});
    return { state: "paid", applied: false, alreadyPaid: true, outcome: "applied", attempt: att, job: fresh };
  }

  // Money taken twice (second device, delayed webhook after cash, stale link).
  const claimed = await claimOutcome(att._id, "duplicate_capture", {
    expected_amount: expected,
  });
  if (claimed) {
    if (fresh) {
      await Job.updateOne({ _id: fresh._id }, { $set: { "payment_flags.duplicate_capture": true } });
    }
    let refund = null;
    try {
      const { requestRefund } = require("./refunds");
      refund = await requestRefund({
        jobId: fresh ? fresh._id : undefined,
        subscriptionId: undefined,
        amount: captured,
        reason: fresh
          ? `Duplicate capture: job already paid by ${fresh.payment_method || "another payment"}`
          : "Captured payment for a job that no longer exists",
        requestedBy: { type: "system", name: "payments" },
        source: "duplicate_capture",
        attemptId: att._id,
      });
      await PaymentAttempt.updateOne({ _id: att._id }, { $set: { refund_case_id: refund._id } });
    } catch (err) {
      console.error("duplicate capture refund case failed:", err.message);
    }
    alertOps("Duplicate SkipCash capture — refund case opened", {
      job_id: att.job_id ? String(att.job_id) : null,
      attempt_id: String(att._id),
      refund_id: refund ? String(refund._id) : null,
      amount: captured,
    });
  }
  return {
    state: "paid",
    applied: false,
    alreadyPaid: true,
    outcome: claimed ? "duplicate_capture" : att.outcome,
    attempt: att,
    job: fresh,
  };
}

/**
 * Ask SkipCash about every pending attempt for a job and settle what changed.
 * @returns {Promise<{ paid: boolean, stillPending: object[], unverified: object[], job: object|null }>}
 */
async function liveCheckJobAttempts(jobId, { fetchImpl, notify, source = "poll", maxAgeMs } = {}) {
  const { getPayment } = require("./skipcashClient");
  const attempts = await pendingAttempts({ jobId, maxAgeMs });
  const stillPending = [];
  const unverified = [];
  let paid = false;
  for (const attempt of attempts) {
    try {
      const remote = await getPayment(attempt.provider_payment_id, { fetchImpl });
      const result = await settleJobAttempt(attempt, {
        source,
        statusId: remote.statusId,
        amount: remote.amount,
        transactionId: remote.transactionId,
        visaId: remote.visaId,
        payUrl: remote.payUrl,
        notify,
      });
      if (result.state === "paid") paid = true;
      else if (result.state === "pending") stillPending.push({ attempt: result.attempt, remote });
    } catch (err) {
      unverified.push({ attempt, error: err.message });
    }
  }
  const job = await Job.findById(jobId);
  return { paid: paid || isJobPaid(job), stillPending, unverified, job };
}

/**
 * Technician cancels the customer's open card checkout(s) so the price can
 * change or cash be taken. Always checks SkipCash first: a paid link settles
 * the job instead of being cancelled.
 */
async function cancelPendingJobAttempts(jobId, { fetchImpl, notify, note } = {}) {
  const check = await liveCheckJobAttempts(jobId, { fetchImpl, notify, source: "poll" });
  if (check.paid) return { ...check, cancelled: [] };
  if (check.unverified.length) return { ...check, cancelled: [] };
  const cancelled = [];
  for (const { attempt } of check.stillPending) {
    const done = await cancelAttemptLocally(attempt._id, note || "cancelled by technician");
    if (done) cancelled.push(done);
  }
  await refreshPriceLock(jobId);
  return { ...check, cancelled, job: await Job.findById(jobId) };
}

function manualPaymentError(message, status = 400, code = "MARK_PAID_INVALID") {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

/**
 * Finance/admin confirms a payment the provider did not (bank transfer, wallet,
 * Fawran, card in the SkipCash portal) or waives the balance. A reference is
 * mandatory for every method except `waived`, which needs a reason instead.
 */
async function markJobPaidManually({ jobId, method, reference, reason, actor, notify } = {}) {
  const m = String(method || "").trim().toLowerCase();
  if (!MANUAL_METHODS.includes(m)) {
    throw manualPaymentError(`payment_method must be one of ${MANUAL_METHODS.join(", ")}`);
  }
  const ref = String(reference || "").trim();
  const why = String(reason || "").trim();
  if (m !== "waived" && !ref) {
    throw manualPaymentError("A payment reference is required", 400, "REFERENCE_REQUIRED");
  }
  if (m === "waived" && !why) {
    throw manualPaymentError("A reason is required to waive a balance", 400, "REASON_REQUIRED");
  }
  const job = await Job.findById(jobId);
  if (!job) throw manualPaymentError("Job not found", 404, "JOB_NOT_FOUND");
  if (job.job_status === "cancelled") {
    throw manualPaymentError("Cannot mark a cancelled job paid", 409, "JOB_CANCELLED");
  }
  if (isJobPaid(job)) {
    return { alreadyPaid: true, job, receipt: await findJobReceipt(job._id) };
  }
  return applyJobPayment(job, {
    paymentMethod: m,
    notes: [why, ref && `Ref ${ref}`].filter(Boolean).join(" — ") || undefined,
    reference: ref || why,
    paidBy: actor,
    paidAmount: m === "waived" ? 0 : undefined,
    notify,
  });
}

module.exports = {
  PAID_STATUSES,
  RECONCILE_MAX_AGE_MS,
  isJobPaid,
  priceJob,
  pricingPayload,
  jobPricingPayload,
  applyJobPayment,
  settleJobAttempt,
  liveCheckJobAttempts,
  cancelPendingJobAttempts,
  refreshPriceLock,
  isPriceLocked,
  markJobPaidManually,
  invalidateTechSessionCache,
};
