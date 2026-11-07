const PaymentAttempt = require("../models/PaymentAttempt");
const { captureException } = require("../middleware/sentry");

const { STATUS_RANK } = PaymentAttempt;
const MAX_EVENTS = 100;

/** SkipCash StatusId → attempt status. Refund-in-progress codes change nothing. */
function attemptStatusFromProvider(statusId) {
  if (statusId === null || statusId === undefined || statusId === "") return null;
  switch (Number(statusId)) {
    case 0: // new
    case 1: // pending
    case 12: // customer started
      return "pending";
    case 2:
      return "paid";
    case 3:
      return "cancelled";
    case 4:
    case 5:
      return "failed";
    case 6:
      return "refunded";
    default:
      return null; // 7 pending refund, 8 refund failed: recorded as events only
  }
}

/** Statuses an attempt may move *from* to reach `target` (strictly lower rank). */
function lowerStatuses(target) {
  const rank = STATUS_RANK[target];
  if (rank == null) return [];
  return Object.keys(STATUS_RANK).filter((status) => STATUS_RANK[status] < rank);
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Structured log + Sentry for money problems someone must look at. */
function alertOps(message, context = {}) {
  console.error(JSON.stringify({ level: "error", msg: "payments_alert", message, ...context }));
  try {
    captureException(new Error(message), { payments_alert: true, ...context });
  } catch {
    /* reporting must never break a payment path */
  }
}

function eventFrom(source, { statusId, status, amount, transactionId, note } = {}) {
  return {
    source,
    status_id: statusId == null || statusId === "" ? null : Number(statusId),
    status: status || "",
    amount: amount == null ? "" : String(amount),
    transaction_id: transactionId ? String(transactionId) : "",
    note: note ? String(note).slice(0, 500) : "",
    at: new Date(),
  };
}

/**
 * Ledger row for a payment SkipCash just created. Unique on the provider id, so
 * a retried request can never write two rows for one charge.
 */
async function recordCreatedAttempt({
  kind,
  jobId = null,
  subscriptionId = null,
  customerId = null,
  result,
  amount,
  createdBy,
  source = "create",
}) {
  const providerId = String(result?.id || result?.payment_id || "").trim();
  if (!providerId) throw new Error("SkipCash result has no payment id");
  const statusId = result?.statusId ?? result?.status_id ?? null;
  const status = attemptStatusFromProvider(statusId) || "pending";
  const doc = {
    kind,
    job_id: jobId,
    subscription_id: subscriptionId,
    customer_id: customerId,
    provider_payment_id: providerId,
    transaction_id: String(result?.transactionId || result?.transaction_id || ""),
    amount: round2(amount),
    currency: result?.currency || "QAR",
    status: status === "paid" ? "pending" : status, // paid is applied via recordProviderResult
    provider_status_id: statusId == null ? null : Number(statusId),
    pay_url: String(result?.payUrl || result?.pay_url || ""),
    events: [eventFrom(source, { statusId, amount, transactionId: result?.transactionId })],
    created_by: createdBy || {},
  };
  try {
    return await PaymentAttempt.create(doc);
  } catch (err) {
    if (err.code !== 11000) throw err;
    const existing = await PaymentAttempt.findOne({ provider_payment_id: providerId });
    const sameTarget =
      existing &&
      existing.kind === kind &&
      String(existing.job_id || "") === String(jobId || "") &&
      String(existing.subscription_id || "") === String(subscriptionId || "");
    if (!sameTarget) {
      // Never attach one provider payment to two different things.
      const collision = new Error("SkipCash returned a payment id that is already in use");
      collision.status = 502;
      collision.code = "SKIPCASH_PAYMENT_ID_COLLISION";
      throw collision;
    }
    return existing;
  }
}

/**
 * A webhook or poll for a payment id we have no ledger row for (issued before
 * the ledger existed). Backfill one so the result is still recorded.
 */
async function ensureAttempt({
  kind,
  providerPaymentId,
  jobId = null,
  subscriptionId = null,
  customerId = null,
  amount,
  transactionId,
}) {
  const id = String(providerPaymentId || "").trim();
  if (!id) return null;
  const existing = await PaymentAttempt.findOne({ provider_payment_id: id });
  if (existing) return existing;
  try {
    return await PaymentAttempt.create({
      kind,
      job_id: jobId,
      subscription_id: subscriptionId,
      customer_id: customerId,
      provider_payment_id: id,
      transaction_id: transactionId ? String(transactionId) : "",
      amount: round2(amount),
      status: "pending",
      events: [eventFrom("backfill", { amount, transactionId })],
    });
  } catch (err) {
    if (err.code !== 11000) throw err;
    return PaymentAttempt.findOne({ provider_payment_id: id });
  }
}

async function findAttemptByProviderId(providerPaymentId) {
  const id = String(providerPaymentId || "").trim();
  if (!id) return null;
  return PaymentAttempt.findOne({ provider_payment_id: id });
}

/**
 * Append what SkipCash said and move the attempt's status — upwards only. A
 * late "failed" can never overwrite "paid". Refund (6) is left to the refund
 * service, which owns refunded amounts.
 *
 * @returns {Promise<{ attempt: object, target: string|null, transitioned: boolean }>}
 */
async function recordProviderResult(
  attempt,
  { source, statusId, amount, transactionId, visaId, payUrl, note } = {}
) {
  const target = attemptStatusFromProvider(statusId);
  const event = eventFrom(source, { statusId, status: target || "", amount, transactionId, note });
  const set = { last_checked_at: new Date() };
  if (statusId != null && statusId !== "") set.provider_status_id = Number(statusId);
  if (transactionId) set.transaction_id = String(transactionId);
  if (visaId) set.visa_id = String(visaId);
  if (payUrl) set.pay_url = String(payUrl);
  const push = { events: { $each: [event], $slice: -MAX_EVENTS } };

  let transitioned = false;
  let updated = null;
  if (target && target !== "refunded") {
    const statusSet = { ...set, status: target };
    if (target === "paid") statusSet.paid_at = new Date();
    updated = await PaymentAttempt.findOneAndUpdate(
      { _id: attempt._id, status: { $in: lowerStatuses(target) } },
      { $set: statusSet, $push: push },
      { new: true }
    );
    transitioned = Boolean(updated);
  }
  if (!updated) {
    updated = await PaymentAttempt.findOneAndUpdate(
      { _id: attempt._id },
      { $set: set, $push: push },
      { new: true }
    );
  }
  return { attempt: updated || attempt, target, transitioned };
}

/** First settler wins: set `outcome` only while it is still empty. */
async function claimOutcome(attemptId, outcome, extra = {}) {
  return PaymentAttempt.findOneAndUpdate(
    { _id: attemptId, outcome: null },
    { $set: { outcome, ...extra } },
    { new: true }
  );
}

/** Mark a still-pending attempt cancelled on our side (the link may stay live at SkipCash). */
async function cancelAttemptLocally(attemptId, note = "cancelled by Clicks") {
  return PaymentAttempt.findOneAndUpdate(
    { _id: attemptId, status: "pending" },
    {
      $set: { status: "cancelled", last_checked_at: new Date() },
      $push: { events: { $each: [eventFrom("cancel", { status: "cancelled", note })], $slice: -MAX_EVENTS } },
    },
    { new: true }
  );
}

async function pendingAttempts({ jobId, subscriptionId, maxAgeMs } = {}) {
  const filter = { status: "pending" };
  if (jobId) filter.job_id = jobId;
  if (subscriptionId) filter.subscription_id = subscriptionId;
  if (maxAgeMs) filter.createdAt = { $gte: new Date(Date.now() - maxAgeMs) };
  return PaymentAttempt.find(filter).sort({ createdAt: -1 });
}

module.exports = {
  attemptStatusFromProvider,
  lowerStatuses,
  alertOps,
  recordCreatedAttempt,
  ensureAttempt,
  findAttemptByProviderId,
  recordProviderResult,
  claimOutcome,
  cancelAttemptLocally,
  pendingAttempts,
  round2,
};
