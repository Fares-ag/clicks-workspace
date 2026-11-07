const mongoose = require("mongoose");
const { Job, Customer, RepairProcedure } = require("../../../clicks-shared/models");
const { assertJobAccess } = require("../utils/ownership");
const { computeJobPricing } = require("../../../clicks-shared/utils/jobPricing");
const {
  getSkipcashConfig,
  formatAmount,
  amountsMatch,
  isPaidStatus,
  isReusableStatus,
  verifyWebhookSignature,
  buildTransactionId,
} = require("../../../clicks-shared/utils/skipcash");
const {
  createPayment,
  getPayment,
  SkipcashError,
} = require("../services/skipcashClient");
const { applyJobPayment } = require("../services/applyJobPayment");
const {
  applyMembershipPayment,
  findMembershipByWebhook,
} = require("../services/applyMembershipPayment");

const PAYABLE_STATUSES = ["in_progress", "completed"];

function fetchImplFor(req) {
  return req.app.get("skipcashFetch") || fetch;
}

function notifyFor(req) {
  return req.app.get("notifyCustomerJobEvent");
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

async function persistSkipcash(job, snapshot) {
  job.skipcash = {
    ...(job.skipcash?.toObject?.() || job.skipcash || {}),
    ...snapshot,
  };
  await job.save();
}

async function settleIfPaid(job, result, { amount, notify, notes }) {
  if (!isPaidStatus(result.statusId)) return null;
  if (amount && result.amount && !amountsMatch(result.amount, amount)) {
    throw new SkipcashError("SkipCash amount does not match the job total", {
      status: 409,
      code: "SKIPCASH_AMOUNT_MISMATCH",
    });
  }
  return applyJobPayment(job, {
    paymentMethod: "card",
    notes,
    skipcash: skipcashSnapshot(result, amount),
    notify,
  });
}

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
    if (job.payment_status === "paid") {
      return res.json({
        already_paid: true,
        payment_status: "paid",
        payment_method: job.payment_method,
      });
    }
    if (!PAYABLE_STATUSES.includes(job.job_status)) {
      return res.status(400).json({
        error: `Cannot pay for a job in status ${job.job_status}`,
        code: "SKIPCASH_NOT_PAYABLE",
      });
    }

    const { amount } = await jobAmount(job);
    const customer = job.customer_id
      ? await Customer.findById(job.customer_id)
      : null;
    const fetchImpl = fetchImplFor(req);
    const notify = notifyFor(req);

    const existingId = job.skipcash?.payment_id;
    if (existingId && job.skipcash?.amount === amount) {
      try {
        const existing = await getPayment(existingId, { fetchImpl });
        const settled = await settleIfPaid(job, existing, { amount, notify });
        if (settled) {
          return res.json({
            already_paid: true,
            payment_status: "paid",
            payment_method: settled.job?.payment_method || "card",
          });
        }
        if (isReusableStatus(existing.statusId) && existing.payUrl) {
          await persistSkipcash(job, skipcashSnapshot(existing, amount));
          return res.json({
            already_paid: false,
            pay_url: existing.payUrl,
            payment_id: existing.id,
            amount,
            currency: existing.currency || "QAR",
            return_url: cfg.returnUrl,
          });
        }
      } catch (lookupErr) {
        if (lookupErr instanceof SkipcashError && lookupErr.code === "SKIPCASH_AMOUNT_MISMATCH") {
          throw lookupErr;
        }
      }
    }

    const created = await createPayment(
      {
        amount,
        customer,
        job,
        transactionId: buildTransactionId(job._id),
        custom1: job._id.toString(),
      },
      { fetchImpl }
    );

    if (!created.payUrl) {
      return res.status(502).json({
        error: "SkipCash did not return a payment URL",
        code: "SKIPCASH_NO_PAY_URL",
      });
    }

    const settled = await settleIfPaid(job, created, { amount, notify });
    if (settled) {
      return res.json({
        already_paid: true,
        payment_status: "paid",
        payment_method: settled.job?.payment_method || "card",
      });
    }

    await persistSkipcash(job, skipcashSnapshot(created, amount));
    return res.json({
      already_paid: false,
      pay_url: created.payUrl,
      payment_id: created.id,
      amount,
      currency: created.currency || "QAR",
      return_url: cfg.returnUrl,
    });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({
      error: err.message || "Failed to start card payment",
      code: err.code || "SKIPCASH_ERROR",
    });
  }
};

const getStatus = async (req, res) => {
  try {
    const job = await loadPayableJob(req);
    if (job.payment_status === "paid") {
      return res.json({
        payment_status: "paid",
        payment_method: job.payment_method,
        amount: job.skipcash?.amount || formatAmount(job.price),
      });
    }

    const paymentId = job.skipcash?.payment_id;
    if (!paymentId) {
      return res.json({
        payment_status: "unpaid",
        amount: (await jobAmount(job)).amount,
      });
    }

    const { amount } = await jobAmount(job);
    const remote = await getPayment(paymentId, { fetchImpl: fetchImplFor(req) });
    const settled = await settleIfPaid(job, remote, {
      amount,
      notify: notifyFor(req),
    });
    if (settled) {
      return res.json({
        payment_status: "paid",
        payment_method: settled.job?.payment_method || "card",
        amount,
      });
    }

    await persistSkipcash(job, skipcashSnapshot(remote, amount));
    return res.json({
      payment_status: "unpaid",
      skipcash_status_id: remote.statusId,
      amount,
    });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({
      error: err.message || "Failed to check payment status",
      code: err.code || "SKIPCASH_ERROR",
    });
  }
};

const handleWebhook = async (req, res) => {
  const cfg = getSkipcashConfig();
  const body = req.body || {};
  if (!verifyWebhookSignature(body, req.get("authorization"), cfg.webhookSecret)) {
    return res.status(401).json({ error: "Invalid SkipCash signature" });
  }

  try {
    const custom2 = String(body.Custom2 || "").toLowerCase();
    if (custom2 === "membership") {
      const sub = await findMembershipByWebhook(body);
      if (!sub) {
        return res.status(404).json({ error: "Membership not found for SkipCash payment" });
      }
      if (!isPaidStatus(body.StatusId)) {
        sub.skipcash = {
          ...(sub.skipcash?.toObject?.() || sub.skipcash || {}),
          payment_id: body.PaymentId || sub.skipcash?.payment_id,
          transaction_id: body.TransactionId || sub.skipcash?.transaction_id,
          status_id: body.StatusId,
          visa_id: body.VisaId || sub.skipcash?.visa_id,
        };
        await sub.save();
        return res.json({ ok: true, status: sub.status });
      }
      const amount = formatAmount(sub.priceQar);
      if (body.Amount && amount && !amountsMatch(body.Amount, amount)) {
        return res.status(409).json({
          error: "SkipCash amount does not match the membership price",
          code: "SKIPCASH_AMOUNT_MISMATCH",
        });
      }
      const settled = await applyMembershipPayment(sub, {
        skipcash: {
          payment_id: body.PaymentId,
          transaction_id: body.TransactionId,
          status_id: body.StatusId,
          visa_id: body.VisaId,
          amount,
        },
        amount,
      });
      return res.json({
        ok: true,
        kind: "membership",
        status: settled.subscription?.status,
        already_paid: settled.subscription?.status === "active",
      });
    }

    let job = null;
    if (mongoose.isValidObjectId(body.Custom1)) {
      job = await Job.findById(body.Custom1);
    }
    if (!job && body.PaymentId) {
      job = await Job.findOne({ "skipcash.payment_id": String(body.PaymentId) });
    }
    if (!job && body.TransactionId) {
      job = await Job.findOne({
        "skipcash.transaction_id": String(body.TransactionId),
      });
    }
    if (!job) {
      const sub = await findMembershipByWebhook(body);
      if (sub) {
        body.Custom2 = "membership";
        return handleWebhook(req, res);
      }
      return res.status(404).json({ error: "Job not found for SkipCash payment" });
    }

    if (!isPaidStatus(body.StatusId)) {
      job.skipcash = {
        ...(job.skipcash?.toObject?.() || job.skipcash || {}),
        payment_id: body.PaymentId || job.skipcash?.payment_id,
        transaction_id: body.TransactionId || job.skipcash?.transaction_id,
        status_id: body.StatusId,
        visa_id: body.VisaId || job.skipcash?.visa_id,
      };
      await job.save();
      return res.json({ ok: true, payment_status: job.payment_status });
    }

    const { amount } = await jobAmount(job);
    if (body.Amount && !amountsMatch(body.Amount, amount)) {
      return res.status(409).json({
        error: "SkipCash amount does not match the job total",
        code: "SKIPCASH_AMOUNT_MISMATCH",
      });
    }

    const settled = await applyJobPayment(job, {
      paymentMethod: "card",
      notes: "SkipCash card payment",
      skipcash: {
        payment_id: body.PaymentId,
        transaction_id: body.TransactionId,
        status_id: body.StatusId,
        visa_id: body.VisaId,
        amount,
      },
      notify: notifyFor(req),
    });

    return res.json({
      ok: true,
      already_paid: settled.alreadyPaid,
      payment_status: "paid",
    });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({
      error: err.message || "SkipCash webhook failed",
      code: err.code || "SKIPCASH_ERROR",
    });
  }
};

module.exports = {
  createSession,
  getStatus,
  handleWebhook,
};
