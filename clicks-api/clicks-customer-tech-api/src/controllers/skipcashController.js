const mongoose = require("mongoose");
const { Job, Customer, RepairProcedure } = require("../../../clicks-shared/models");
const { assertJobAccess } = require("../utils/ownership");
const { computeJobPricing } = require("../../../clicks-shared/utils/jobPricing");
const {
  getSkipcashConfig,
  formatAmount,
  amountsMatch,
  isReusableStatus,
  verifyWebhookSignature,
  buildTransactionId,
} = require("../../../clicks-shared/utils/skipcash");
const {
  createPayment,
  getPayment,
  SkipcashError,
} = require("../services/skipcashClient");
const {
  isJobPaid,
  settleJobAttempt,
  liveCheckJobAttempts,
  cancelPendingJobAttempts,
  jobPricingPayload,
} = require("../../../clicks-shared/services/jobPayment");
const {
  settleMembershipAttempt,
  findMembershipByWebhook,
} = require("../../../clicks-shared/services/membershipPayment");
const {
  recordCreatedAttempt,
  ensureAttempt,
  findAttemptByProviderId,
  cancelAttemptLocally,
  pendingAttempts,
  alertOps,
} = require("../../../clicks-shared/services/paymentAttempts");

const PAYABLE_STATUSES = ["in_progress", "completed"];
const CHECKOUT_LOCK_MS = 20 * 1000;
const CHECKOUT_LOCK_WAIT_MS = 4000;

function fetchImplFor(req) {
  return req.app.get("skipcashFetch") || fetch;
}

// Payment confirmations go through the one customer notifier (inbox -> socket
// -> push), whichever API process runs this.
function notifyFor(_req) {
  return require("../../../clicks-shared/services/notifyCustomer").notifyCustomerSafe;
}

function skipcashSnapshot(result, amount) {
  return {
    payment_id: result.id || "",
    pay_url: result.payUrl || "",
    transaction_id: result.transactionId || "",
    status_id: result.statusId,
    visa_id: result.visaId || "",
    amount: result.amount || amount,
    created_at: result.created ? new Date(result.created) : new Date(),
  };
}

function sendError(res, err, fallback) {
  const status = err.status || 500;
  return res.status(status).json({
    error: err.message || fallback,
    code: err.code || "SKIPCASH_ERROR",
  });
}

async function loadPayableJob(req) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    throw new SkipcashError("Job not found", { status: 404, code: "JOB_NOT_FOUND" });
  }
  const job = await Job.findById(id);
  if (!job) {
    throw new SkipcashError("Job not found", { status: 404, code: "JOB_NOT_FOUND" });
  }
  if (!assertJobAccess(job, req.user)) {
    throw new SkipcashError("Forbidden", { status: 403, code: "FORBIDDEN" });
  }
  return job;
}

async function jobAmount(job) {
  const repairs = await RepairProcedure.find({ job_id: job._id });
  const pricing = computeJobPricing(job, repairs);
  const amount = formatAmount(pricing.total);
  if (!amount) {
    throw new SkipcashError("This job has no amount to collect", {
      status: 400,
      code: "SKIPCASH_INVALID_AMOUNT",
    });
  }
  return { amount, pricing };
}

function paidResponse(job) {
  return {
    already_paid: true,
    payment_status: job?.payment_status || "paid",
    payment_method: job?.payment_method || "card",
  };
}

/** Per-job checkout mutex: a conditional set of payment_lock_until. */
async function acquireCheckoutLock(jobId) {
  const deadline = Date.now() + CHECKOUT_LOCK_WAIT_MS;
  for (;;) {
    const now = new Date();
    const locked = await Job.findOneAndUpdate(
      {
        _id: jobId,
        $or: [{ payment_lock_until: null }, { payment_lock_until: { $lte: now } }],
      },
      { $set: { payment_lock_until: new Date(now.getTime() + CHECKOUT_LOCK_MS) } },
      { new: true }
    );
    if (locked) return locked;
    if (Date.now() >= deadline) return null;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

async function releaseCheckoutLock(jobId) {
  await Job.updateOne({ _id: jobId }, { $set: { payment_lock_until: null } }).catch(() => {});
}

function sessionResponse(attempt, { amount, cfg, pricing, reused }) {
  return {
    already_paid: false,
    pay_url: attempt.pay_url,
    payment_id: attempt.provider_payment_id,
    amount,
    currency: attempt.currency || "QAR",
    return_url: cfg.returnUrl,
    reused: Boolean(reused),
    pricing,
  };
}

/**
 * Open (or reuse) the card checkout for a job. Double taps, a second device
 * and "Back, Pay again" all get the same live SkipCash link: the per-job lock
 * serialises callers and the newest pending attempt is reused when SkipCash
 * says it is still payable for the same amount. A new link freezes the price.
 */
const createSession = async (req, res) => {
  try {
    const cfg = getSkipcashConfig();
    if (!cfg.enabled) {
      return res.status(503).json({
        error: "Card payment is not available right now",
        code: "SKIPCASH_DISABLED",
      });
    }

    const job = await loadPayableJob(req);
    if (isJobPaid(job)) return res.json(paidResponse(job));
    if (!PAYABLE_STATUSES.includes(job.job_status)) {
      return res.status(400).json({
        error: `Cannot pay for a job in status ${job.job_status}`,
        code: "SKIPCASH_NOT_PAYABLE",
      });
    }

    const locked = await acquireCheckoutLock(job._id);
    if (!locked) {
      return res.status(409).json({
        error: "A payment is already being prepared for this job. Try again in a moment.",
        code: "CHECKOUT_BUSY",
      });
    }
    try {
      const current = await Job.findById(job._id);
      if (isJobPaid(current)) return res.json(paidResponse(current));
      const { amount } = await jobAmount(current);
      const pricing = await jobPricingPayload(current);
      const fetchImpl = fetchImplFor(req);
      const notify = notifyFor(req);

      // Reuse the newest pending checkout when SkipCash says it is still live.
      const open = await pendingAttempts({ jobId: current._id });
      for (const attempt of open) {
        let remote;
        try {
          remote = await getPayment(attempt.provider_payment_id, { fetchImpl });
        } catch (lookupErr) {
          // SkipCash unreachable: hand back the stored link rather than create
          // a second live one the customer could also pay.
          if (attempt === open[0] && attempt.pay_url && amountsMatch(attempt.amount, amount)) {
            return res.json(sessionResponse(attempt, { amount, cfg, pricing, reused: true }));
          }
          continue;
        }
        const settled = await settleJobAttempt(attempt, {
          source: "checkout",
          statusId: remote.statusId,
          amount: remote.amount,
          transactionId: remote.transactionId,
          visaId: remote.visaId,
          payUrl: remote.payUrl,
          notify,
        });
        if (settled.state === "paid") {
          const paidJob = await Job.findById(current._id);
          return res.json(paidResponse(paidJob));
        }
        if (
          settled.state === "pending" &&
          isReusableStatus(remote.statusId) &&
          (remote.payUrl || attempt.pay_url) &&
          amountsMatch(attempt.amount, amount)
        ) {
          return res.json(
            sessionResponse(settled.attempt, { amount, cfg, pricing, reused: true })
          );
        }
        if (settled.state === "pending") {
          // Live but for another amount (price changed before the lock
          // existed): retire it; if it is ever paid it is still recorded.
          await cancelAttemptLocally(attempt._id, "superseded by a new amount");
        }
      }

      const customer = current.customer_id ? await Customer.findById(current.customer_id) : null;
      const created = await createPayment(
        {
          amount,
          customer,
          job: current,
          transactionId: buildTransactionId(current._id),
          custom1: current._id.toString(),
        },
        { fetchImpl }
      );
      if (!created.payUrl) {
        return res.status(502).json({
          error: "SkipCash did not return a payment URL",
          code: "SKIPCASH_NO_PAY_URL",
        });
      }

      const attempt = await recordCreatedAttempt({
        kind: "job",
        jobId: current._id,
        customerId: current.customer_id,
        result: created,
        amount: Number(amount),
        createdBy: { type: req.user.role, id: req.user.id },
      });
      await Job.updateOne(
        { _id: current._id },
        {
          $set: {
            price_locked: true,
            skipcash: {
              ...(current.skipcash?.toObject?.() || current.skipcash || {}),
              ...skipcashSnapshot(created, amount),
            },
          },
        }
      );

      if (created.statusId != null && Number(created.statusId) === 2) {
        const settled = await settleJobAttempt(attempt, {
          source: "create",
          statusId: created.statusId,
          amount: created.amount || amount,
          notify,
        });
        if (settled.state === "paid") {
          return res.json(paidResponse(await Job.findById(current._id)));
        }
      }

      return res.json(sessionResponse(attempt, { amount, cfg, pricing, reused: false }));
    } finally {
      await releaseCheckoutLock(job._id);
    }
  } catch (err) {
    return sendError(res, err, "Failed to start card payment");
  }
};

/**
 * Customer polling, and the technician's "re-check card payment": ask
 * SkipCash about every pending attempt for the job (not only the newest).
 */
const getStatus = async (req, res) => {
  try {
    const job = await loadPayableJob(req);
    if (isJobPaid(job)) {
      return res.json({
        payment_status: job.payment_status,
        payment_method: job.payment_method,
        amount: formatAmount(job.paid_amount ?? job.skipcash?.amount ?? job.price) || "0.00",
        pricing: await jobPricingPayload(job),
      });
    }

    const open = await pendingAttempts({ jobId: job._id });
    if (!open.length) {
      // Pre-ledger jobs: a payment id stored on the job but no attempt row.
      const legacyId = job.skipcash?.payment_id;
      if (legacyId && !(await findAttemptByProviderId(legacyId))) {
        await ensureAttempt({
          kind: "job",
          providerPaymentId: legacyId,
          jobId: job._id,
          customerId: job.customer_id,
          amount: Number(job.skipcash?.amount) || 0,
        });
      }
    }

    const check = await liveCheckJobAttempts(job._id, {
      fetchImpl: fetchImplFor(req),
      notify: notifyFor(req),
      source: "poll",
    });
    const pricing = await jobPricingPayload(check.job || job);
    if (check.paid) {
      return res.json({
        payment_status: check.job?.payment_status || "paid",
        payment_method: check.job?.payment_method || "card",
        amount: formatAmount(pricing?.total) || "0.00",
        pricing,
      });
    }
    const latest = check.stillPending[0];
    return res.json({
      payment_status: "unpaid",
      skipcash_status_id: latest?.remote?.statusId ?? null,
      pending_card_payment: check.stillPending.length > 0,
      unverified: check.unverified.length > 0 || undefined,
      amount: formatAmount(pricing?.total) || "0.00",
      pricing,
    });
  } catch (err) {
    return sendError(res, err, "Failed to check payment status");
  }
};

/**
 * Technician cancels the customer's open card checkout (after a live check)
 * so the price can change or cash can be taken.
 */
const cancelCheckout = async (req, res) => {
  try {
    const job = await loadPayableJob(req);
    if (isJobPaid(job)) return res.json({ ...paidResponse(job), cancelled: 0 });
    const result = await cancelPendingJobAttempts(job._id, {
      fetchImpl: fetchImplFor(req),
      notify: notifyFor(req),
      note: `cancelled by ${req.user.role}`,
    });
    if (result.paid) {
      return res.status(409).json({
        error: "The customer has already paid by card.",
        code: "CARD_PAYMENT_RECEIVED",
        ...paidResponse(result.job),
      });
    }
    if (result.unverified.length) {
      return res.status(409).json({
        error: "Could not reach SkipCash to confirm the payment was not made. Try again.",
        code: "CARD_PAYMENT_UNVERIFIED",
      });
    }
    return res.json({
      cancelled: result.cancelled.length,
      payment_status: result.job?.payment_status || "unpaid",
      price_locked: Boolean(result.job?.price_locked),
    });
  } catch (err) {
    return sendError(res, err, "Failed to cancel card payment");
  }
};

async function handleMembershipWebhook(body, res) {
  let attempt = await findAttemptByProviderId(body.PaymentId);
  if (!attempt) {
    const sub = await findMembershipByWebhook(body);
    if (!sub) {
      return res.status(404).json({ error: "Membership not found for SkipCash payment" });
    }
    attempt = await ensureAttempt({
      kind: "membership",
      providerPaymentId: body.PaymentId || sub.skipcash?.payment_id,
      subscriptionId: sub._id,
      customerId: sub.customer_id,
      amount: Number(body.Amount || sub.priceQar) || 0,
      transactionId: body.TransactionId,
    });
  }
  if (!attempt) {
    return res.status(404).json({ error: "Membership not found for SkipCash payment" });
  }
  const result = await settleMembershipAttempt(attempt, {
    source: "webhook",
    statusId: body.StatusId,
    amount: body.Amount,
    transactionId: body.TransactionId,
    visaId: body.VisaId,
  });
  return res.json({
    ok: true,
    kind: "membership",
    status: result.subscription?.status,
    outcome: result.outcome || null,
    already_paid: result.subscription?.status === "active",
  });
}

/**
 * SkipCash webhook. Looked up by payment id first, so a payment for ANY link
 * ever issued (job or membership) is recorded. Recognised payments always get
 * 200 — duplicates and amount mismatches are handled on our side (refund case,
 * finance flag), never by making SkipCash retry forever.
 */
const handleWebhook = async (req, res) => {
  const cfg = getSkipcashConfig();
  const body = req.body || {};
  if (!verifyWebhookSignature(body, req.get("authorization"), cfg.webhookSecret)) {
    alertOps("SkipCash webhook rejected: bad signature (check SKIPCASH_WEBHOOK_SECRET)", {
      payment_id: body.PaymentId ? String(body.PaymentId) : null,
    });
    return res.status(401).json({ error: "Invalid SkipCash signature" });
  }

  try {
    const existing = await findAttemptByProviderId(body.PaymentId);
    const custom2 = String(body.Custom2 || "").toLowerCase();
    if (existing?.kind === "membership" || (!existing && custom2 === "membership")) {
      return handleMembershipWebhook(body, res);
    }

    let attempt = existing;
    if (!attempt) {
      let job = null;
      if (mongoose.isValidObjectId(body.Custom1)) job = await Job.findById(body.Custom1);
      if (!job && body.PaymentId) {
        job = await Job.findOne({ "skipcash.payment_id": String(body.PaymentId) });
      }
      if (!job && body.TransactionId) {
        job = await Job.findOne({ "skipcash.transaction_id": String(body.TransactionId) });
      }
      if (!job) {
        const sub = await findMembershipByWebhook(body);
        if (sub) return handleMembershipWebhook(body, res);
        return res.status(404).json({ error: "Job not found for SkipCash payment" });
      }
      attempt = await ensureAttempt({
        kind: "job",
        providerPaymentId: body.PaymentId || job.skipcash?.payment_id,
        jobId: job._id,
        customerId: job.customer_id,
        amount: Number(body.Amount || job.skipcash?.amount) || 0,
        transactionId: body.TransactionId,
      });
      if (!attempt) {
        // No payment id at all: record nothing we can key on, but keep the old
        // snapshot behaviour so the job still shows what SkipCash said.
        return res.status(400).json({ error: "SkipCash webhook without PaymentId" });
      }
    }

    const result = await settleJobAttempt(attempt, {
      source: "webhook",
      statusId: body.StatusId,
      amount: body.Amount,
      transactionId: body.TransactionId,
      visaId: body.VisaId,
      notify: notifyFor(req),
    });
    const job = result.job || (attempt.job_id ? await Job.findById(attempt.job_id) : null);
    return res.json({
      ok: true,
      outcome: result.outcome || null,
      attempt_status: result.attempt?.status,
      already_paid: Boolean(result.alreadyPaid),
      payment_status: job?.payment_status || "unpaid",
    });
  } catch (err) {
    console.error("SkipCash webhook failed:", err);
    return sendError(res, err, "SkipCash webhook failed");
  }
};

module.exports = {
  createSession,
  getStatus,
  cancelCheckout,
  handleWebhook,
};
