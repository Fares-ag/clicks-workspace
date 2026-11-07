const CustomerSubscription = require("../models/CustomerSubscription");
const { activateSubscription } = require("./membershipEntitlement");
const { isPaidStatus, isRefundedStatus, amountsMatch, formatAmount } = require("../utils/skipcash");
const {
  recordProviderResult,
  claimOutcome,
  ensureAttempt,
  findAttemptByProviderId,
  alertOps,
  round2,
} = require("./paymentAttempts");

function skipcashSnapshot(result, amount) {
  return {
    payment_id: result.payment_id || result.id || result.PaymentId || "",
    pay_url: result.pay_url || result.payUrl || "",
    transaction_id: result.transaction_id || result.transactionId || result.TransactionId || "",
    status_id: result.status_id ?? result.statusId ?? result.StatusId ?? null,
    visa_id: result.visa_id || result.visaId || result.VisaId || "",
    amount: result.amount || result.Amount || amount || "",
    created_at: result.created_at || result.created
      ? new Date(result.created_at || result.created)
      : new Date(),
  };
}

/**
 * Record a SkipCash result for a membership attempt and act on it: a capture
 * activates the subscription, or — when the vehicle already has an active one
 * or this one was deliberately cancelled — marks it paid_duplicate and opens a
 * refund case. An amount that differs from the plan price is applied and
 * flagged, never rejected.
 */
async function settleMembershipAttempt(
  attempt,
  { source = "webhook", statusId, amount, transactionId, visaId, payUrl } = {}
) {
  const { attempt: att } = await recordProviderResult(attempt, {
    source,
    statusId,
    amount,
    transactionId,
    visaId,
    payUrl,
  });
  const sub = att.subscription_id ? await CustomerSubscription.findById(att.subscription_id) : null;

  if (isRefundedStatus(statusId)) {
    const { recordProviderRefund } = require("./refunds");
    const refund = await recordProviderRefund({ attempt: att, amount });
    return { state: "refunded", attempt: att, subscription: sub, refund };
  }

  if (att.status !== "paid") {
    if (sub && sub.status !== "active" && String(sub.skipcash?.payment_id || "") === att.provider_payment_id) {
      sub.skipcash = {
        ...(sub.skipcash?.toObject?.() || sub.skipcash || {}),
        status_id: statusId == null ? sub.skipcash?.status_id : Number(statusId),
      };
      await sub.save();
    }
    return { state: att.status, attempt: att, subscription: sub };
  }
  if (!sub) {
    alertOps("Membership capture for a subscription that no longer exists", {
      attempt_id: String(att._id),
    });
    return { state: "paid", attempt: att, subscription: null };
  }

  const captured = round2(amount != null && amount !== "" ? amount : att.amount);
  const snap = skipcashSnapshot(
    {
      payment_id: att.provider_payment_id,
      pay_url: att.pay_url,
      transaction_id: transactionId || att.transaction_id,
      status_id: 2,
      visa_id: visaId || att.visa_id,
      amount: formatAmount(captured) || String(captured),
    },
    captured
  );
  if (sub.resolveStatus() === "active") {
    // Already live. The same capture reported twice (webhook + poll) is a
    // no-op; any other capture is a second payment for one membership.
    if (String(sub.skipcash?.payment_id || "") === att.provider_payment_id || att.outcome) {
      await claimOutcome(att._id, "applied", {});
      return { state: "paid", outcome: "already_active", attempt: att, subscription: sub };
    }
    const asDuplicate = await activateDuplicateRefund(att, sub, captured);
    return { state: "paid", outcome: asDuplicate, attempt: att, subscription: sub };
  }

  const result = await activateSubscription(sub, snap);
  const updated = result.subscription;

  if (result.outcome === "paid_duplicate") {
    const claimed = await claimOutcome(att._id, "duplicate_capture", {
      expected_amount: Number(sub.priceQar) || 0,
    });
    if (claimed) {
      let refund = null;
      try {
        const { requestRefund } = require("./refunds");
        refund = await requestRefund({
          jobId: undefined,
          subscriptionId: updated._id,
          amount: captured,
          reason: "Membership paid twice / after cancellation — refund the duplicate payment",
          requestedBy: { type: "system", name: "payments" },
          source: "membership_duplicate",
          attemptId: att._id,
        });
        const PaymentAttempt = require("../models/PaymentAttempt");
        await PaymentAttempt.updateOne({ _id: att._id }, { $set: { refund_case_id: refund._id } });
      } catch (err) {
        console.error("membership duplicate refund case failed:", err.message);
      }
      alertOps("Membership paid as a duplicate — refund case opened", {
        subscription_id: String(updated._id),
        attempt_id: String(att._id),
        refund_id: refund ? String(refund._id) : null,
      });
    }
    return { state: "paid", outcome: "paid_duplicate", attempt: att, subscription: updated };
  }

  if (result.outcome === "activated") {
    const mismatch = !amountsMatch(captured, sub.priceQar);
    await claimOutcome(att._id, mismatch ? "amount_mismatch" : "applied", {
      expected_amount: Number(sub.priceQar) || 0,
    });
    if (mismatch) {
      alertOps("Membership capture differs from the plan price — activated, needs review", {
        subscription_id: String(updated._id),
        captured,
        expected: sub.priceQar,
      });
    }
  } else if (result.outcome === "already_active") {
    await claimOutcome(att._id, "applied", {});
  }
  return { state: "paid", outcome: result.outcome, attempt: att, subscription: updated };
}

async function activateDuplicateRefund(att, sub, captured) {
  const claimed = await claimOutcome(att._id, "duplicate_capture", {
    expected_amount: Number(sub.priceQar) || 0,
  });
  if (!claimed) return att.outcome;
  try {
    const { requestRefund } = require("./refunds");
    const refund = await requestRefund({
      jobId: undefined,
      subscriptionId: sub._id,
      amount: captured,
      reason: "Second payment for an already active membership",
      requestedBy: { type: "system", name: "payments" },
      source: "membership_duplicate",
      attemptId: att._id,
    });
    const PaymentAttempt = require("../models/PaymentAttempt");
    await PaymentAttempt.updateOne({ _id: att._id }, { $set: { refund_case_id: refund._id } });
  } catch (err) {
    console.error("membership duplicate refund case failed:", err.message);
  }
  alertOps("Second membership capture for an active subscription", {
    subscription_id: String(sub._id),
    attempt_id: String(att._id),
  });
  return "duplicate_capture";
}

/**
 * Back-compat entry point (CT checkout/status): apply a SkipCash result that
 * belongs to `sub`, through the attempt ledger.
 */
async function applyMembershipPayment(sub, { skipcash, amount, source = "poll" } = {}) {
  if (!sub) return { alreadyActive: false, subscription: null };
  const snap = skipcash ? skipcashSnapshot(skipcash, amount) : null;
  const providerId = snap?.payment_id || sub.skipcash?.payment_id;
  let attempt = await findAttemptByProviderId(providerId);
  if (!attempt) {
    attempt = await ensureAttempt({
      kind: "membership",
      providerPaymentId: providerId,
      subscriptionId: sub._id,
      customerId: sub.customer_id,
      amount: Number(snap?.amount || amount || sub.priceQar) || 0,
      transactionId: snap?.transaction_id,
    });
  }
  const wasActive = sub.status === "active";
  const result = await settleMembershipAttempt(attempt, {
    source,
    statusId: snap?.status_id,
    amount: snap?.amount || amount,
    transactionId: snap?.transaction_id,
    visaId: snap?.visa_id,
    payUrl: snap?.pay_url,
  });
  const updated = result.subscription || sub;
  return {
    alreadyActive: wasActive && updated.status === "active",
    subscription: updated,
    paid: isPaidStatus(snap?.status_id) || result.state === "paid",
    outcome: result.outcome,
  };
}

async function findMembershipByWebhook(body) {
  if (body?.Custom1 && String(body.Custom1).match(/^[a-f0-9]{24}$/i)) {
    const byId = await CustomerSubscription.findById(body.Custom1);
    if (byId) return byId;
  }
  if (body?.PaymentId) {
    const byPay = await CustomerSubscription.findOne({
      "skipcash.payment_id": String(body.PaymentId),
    });
    if (byPay) return byPay;
  }
  if (body?.TransactionId) {
    const byTx = await CustomerSubscription.findOne({
      "skipcash.transaction_id": String(body.TransactionId),
    });
    if (byTx) return byTx;
  }
  return null;
}

module.exports = {
  skipcashSnapshot,
  settleMembershipAttempt,
  applyMembershipPayment,
  findMembershipByWebhook,
};
