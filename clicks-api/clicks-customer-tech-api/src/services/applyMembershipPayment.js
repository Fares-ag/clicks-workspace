const CustomerSubscription = require("../../../clicks-shared/models/CustomerSubscription");
const {
  activateSubscription,
} = require("../../../clicks-shared/services/membershipEntitlement");
const { isPaidStatus, amountsMatch } = require("../../../clicks-shared/utils/skipcash");

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

async function applyMembershipPayment(sub, { skipcash, amount } = {}) {
  if (!sub) return { alreadyActive: false, subscription: null };
  const snap = skipcash ? skipcashSnapshot(skipcash, amount) : null;
  if (amount && snap?.amount && !amountsMatch(snap.amount, amount)) {
    const err = new Error("SkipCash amount does not match the membership price");
    err.status = 409;
    err.code = "SKIPCASH_AMOUNT_MISMATCH";
    throw err;
  }
  const statusId = snap?.status_id;
  if (statusId != null && !isPaidStatus(statusId) && sub.status !== "active") {
    sub.skipcash = {
      ...(sub.skipcash?.toObject?.() || sub.skipcash || {}),
      ...snap,
    };
    await sub.save();
    return { alreadyActive: false, subscription: sub, paid: false };
  }
  const updated = await activateSubscription(sub, snap);
  return {
    alreadyActive: sub.status === "active" && updated.status === "active",
    subscription: updated,
    paid: updated.status === "active",
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
  applyMembershipPayment,
  findMembershipByWebhook,
  skipcashSnapshot,
};
