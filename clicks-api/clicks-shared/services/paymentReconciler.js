const PaymentAttempt = require("../models/PaymentAttempt");
const { getSkipcashConfig } = require("../utils/skipcash");
const { acquireLease } = require("./opsLease");
const { alertOps } = require("./paymentAttempts");

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const MAX_AGE_MS = 48 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const SWEEP_LEASE = "payments:reconcile";
const STALE_REPORT_LEASE = "payments:stale-report";

/**
 * One pass: ask SkipCash about every pending attempt younger than 48h and
 * apply the answer (job or membership). This is what makes a payment register
 * when the customer closed the WebView and the webhook never arrived.
 */
async function reconcilePendingAttempts({
  fetchImpl,
  notify,
  maxAgeMs = MAX_AGE_MS,
  limit = 200,
  now = new Date(),
} = {}) {
  const { getPayment } = require("./skipcashClient");
  const { settleJobAttempt } = require("./jobPayment");
  const { settleMembershipAttempt } = require("./membershipPayment");

  const attempts = await PaymentAttempt.find({
    status: "pending",
    createdAt: { $gte: new Date(now.getTime() - maxAgeMs) },
  })
    .sort({ last_checked_at: 1, createdAt: 1 })
    .limit(limit);

  const summary = { checked: 0, paid: 0, failed: 0, pending: 0, errors: 0 };
  for (const attempt of attempts) {
    summary.checked += 1;
    try {
      const remote = await getPayment(attempt.provider_payment_id, { fetchImpl });
      const input = {
        source: "sweep",
        statusId: remote.statusId,
        amount: remote.amount,
        transactionId: remote.transactionId,
        visaId: remote.visaId,
        payUrl: remote.payUrl,
      };
      const result =
        attempt.kind === "membership"
          ? await settleMembershipAttempt(attempt, input)
          : await settleJobAttempt(attempt, { ...input, notify });
      if (result.state === "paid") summary.paid += 1;
      else if (result.state === "pending") summary.pending += 1;
      else summary.failed += 1;
    } catch (err) {
      summary.errors += 1;
      await PaymentAttempt.updateOne(
        { _id: attempt._id },
        { $set: { last_checked_at: new Date() } }
      ).catch(() => {});
      console.error(
        JSON.stringify({
          level: "warn",
          msg: "payment_reconcile_lookup_failed",
          attempt_id: String(attempt._id),
          error: err.message,
        })
      );
    }
  }
  return summary;
}

/** Attempts SkipCash never resolved within 48h — someone must look at these. */
async function findStalePendingAttempts({ now = new Date(), limit = 500 } = {}) {
  return PaymentAttempt.find({
    status: "pending",
    createdAt: { $lt: new Date(now.getTime() - MAX_AGE_MS) },
  })
    .sort({ createdAt: 1 })
    .limit(limit)
    .lean();
}

async function reportStalePendingAttempts({ now = new Date() } = {}) {
  const stale = await findStalePendingAttempts({ now });
  if (stale.length) {
    alertOps("Payment attempts still pending after 48 hours", {
      count: stale.length,
      attempt_ids: stale.slice(0, 50).map((a) => String(a._id)),
    });
  }
  return stale;
}

/**
 * Every `intervalMs` (default 5 min), on whichever instance holds the lease.
 * The lease is not released after a tick: it covers the interval, so two
 * instances never sweep in the same window. The daily stale report takes its
 * own 24h lease.
 */
function startPaymentReconciler({
  intervalMs = DEFAULT_INTERVAL_MS,
  fetchImpl,
  notify,
  runImmediately = true,
} = {}) {
  const handle = { interval: null, stopped: false, inFlight: null };

  const tick = async () => {
    if (handle.stopped || handle.inFlight) return;
    handle.inFlight = (async () => {
      try {
        if (!getSkipcashConfig().enabled) return;
        const lease = await acquireLease(SWEEP_LEASE, Math.max(1000, intervalMs - 5000));
        if (!lease) return;
        const summary = await reconcilePendingAttempts({
          fetchImpl: typeof fetchImpl === "function" ? fetchImpl : undefined,
          notify: typeof notify === "function" ? notify : undefined,
        });
        if (summary.checked) {
          console.log(JSON.stringify({ level: "info", msg: "payment_reconcile", ...summary }));
        }
        const daily = await acquireLease(STALE_REPORT_LEASE, DAY_MS);
        if (daily) await reportStalePendingAttempts();
      } catch (err) {
        console.error("[payments] reconcile tick failed:", err.message);
      }
    })();
    try {
      await handle.inFlight;
    } finally {
      handle.inFlight = null;
    }
  };

  if (runImmediately) tick();
  handle.interval = setInterval(tick, intervalMs);
  handle.interval.unref?.();
  handle.tick = tick;
  return handle;
}

async function stopPaymentReconciler(handle) {
  if (!handle) return;
  handle.stopped = true;
  if (handle.interval) {
    clearInterval(handle.interval);
    handle.interval = null;
  }
  if (handle.inFlight) {
    try {
      await handle.inFlight;
    } catch {
      /* already logged */
    }
  }
}

module.exports = {
  reconcilePendingAttempts,
  findStalePendingAttempts,
  reportStalePendingAttempts,
  startPaymentReconciler,
  stopPaymentReconciler,
  SWEEP_LEASE,
};
