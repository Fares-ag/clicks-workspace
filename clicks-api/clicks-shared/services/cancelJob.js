/**
 * One cancel service for every path (scenarios 50, 51, 57).
 *
 * Customer, technician (for jobs the technician created) and admin cancels all
 * go through here so they behave the same:
 *   1. conditional update — only a job still in an allowed status, with the
 *      payment status we validated against, is moved to cancelled;
 *   2. the linked SOS gets its terminal outcome;
 *   3. the linked ServiceRequest is moved to cancelled (WS-G);
 *   4. the technician is freed (unless they still hold another live job);
 *   5. customer + technician are notified through the caller's notifier.
 *
 * A PAID job can only be cancelled by an admin, and only with an explicit
 * refund decision (full | partial | none + reason), which is stored on the job.
 */
const Job = require("../models/Job");
const SOSRequest = require("../models/SOSRequest");
const { markServiceRequestForJob } = require("./serviceRequestLifecycle");
const { resolveTechnicianStatusAfterJob } = require("./jobHold");
const { setTechnicianStatus } = require("./technicianOnlineHours");
const {
  CUSTOMER_CANCELLABLE_STATUSES,
} = require("../utils/customerCancelPolicy");

const ADMIN_CANCELLABLE_STATUSES = [
  "pending",
  "assigned",
  "accepted",
  "en_route",
  "arrived",
  "in_progress",
  "on_hold",
];
const TECHNICIAN_CANCELLABLE_STATUSES = [
  "accepted",
  "en_route",
  "arrived",
  "in_progress",
];
const REFUND_DECISIONS = ["full", "partial", "none"];

function cancelError(message, status, code, extra = {}) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  Object.assign(err, extra);
  return err;
}

function defaultAllowedStatuses(actor) {
  if (actor === "customer") return CUSTOMER_CANCELLABLE_STATUSES;
  if (actor === "technician") return TECHNICIAN_CANCELLABLE_STATUSES;
  return ADMIN_CANCELLABLE_STATUSES;
}

/**
 * Validate the refund decision an admin must give for a paid job.
 * @returns {{ decision: string, amount: number|null, reason: string }}
 */
async function paidTotalForJob(job) {
  const card = Number(job?.skipcash?.amount);
  if (Number.isFinite(card) && card > 0) return card;
  const RepairProcedure = require("../models/RepairProcedure");
  const { computeJobPricing } = require("../utils/jobPricing");
  const repairs = await RepairProcedure.find({ job_id: job._id })
    .select("price cost quantity")
    .lean();
  return Number(computeJobPricing(job, repairs)?.total) || Number(job?.price) || 0;
}

function validateRefundDecision(refund, job, paidTotal) {
  const decision = String(refund?.decision || "").trim();
  if (!REFUND_DECISIONS.includes(decision)) {
    throw cancelError(
      "This job is paid. Choose a refund decision (full, partial or none) to cancel it.",
      400,
      "REFUND_DECISION_REQUIRED"
    );
  }
  const reason = String(refund?.reason || "").trim();
  if (!reason) {
    throw cancelError(
      "A reason is required for the refund decision",
      400,
      "REFUND_REASON_REQUIRED"
    );
  }
  let amount = null;
  const paid = Number.isFinite(paidTotal) ? paidTotal : Number(job?.price) || 0;
  if (decision === "partial") {
    amount = Number(refund?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw cancelError(
        "refund_amount must be a positive number for a partial refund",
        400,
        "REFUND_AMOUNT_INVALID"
      );
    }
    if (paid > 0 && amount > paid) {
      throw cancelError(
        `refund_amount cannot exceed the amount paid (${paid})`,
        400,
        "REFUND_AMOUNT_INVALID"
      );
    }
    amount = Math.round(amount * 100) / 100;
  } else if (decision === "full") {
    amount = paid;
  } else {
    amount = 0;
  }
  return { decision, amount, reason: reason.slice(0, 1000) };
}

async function safeNotify(fn, ...args) {
  if (typeof fn !== "function") return;
  try {
    await fn(...args);
  } catch (err) {
    console.error("[cancelJob] notify failed:", err.message);
  }
}

/**
 * @param {object} args
 * @param {string} args.jobId
 * @param {"customer"|"technician"|"admin"} args.actor
 * @param {string} [args.actorId]     customer / technician / admin id
 * @param {string} [args.reason]
 * @param {string[]} [args.allowedStatuses]
 * @param {boolean} [args.feeDue]     customer late-cancel fee flag
 * @param {{decision, amount, reason}} [args.refund]  required for paid jobs
 * @param {boolean} [args.countAgainstTechnician]  bump cancel counters
 * @param {{ customerJobEvent?, technicianJobEvent?, technicianPresence? }} [args.notifier]
 */
async function cancelJob({
  jobId,
  actor,
  actorId,
  reason,
  allowedStatuses,
  feeDue = false,
  refund,
  countAgainstTechnician,
  notifier = {},
} = {}) {
  if (!["customer", "technician", "admin"].includes(actor)) {
    throw new Error(`cancelJob: unknown actor "${actor}"`);
  }
  const before = await Job.findById(jobId);
  if (!before) throw cancelError("Job not found", 404, "JOB_NOT_FOUND");

  const cancellationReason =
    (typeof reason === "string" && reason.trim()) || `Cancelled by ${actor}`;

  if (before.job_status === "cancelled") {
    return { job: before, alreadyCancelled: true };
  }

  const allowed = allowedStatuses || defaultAllowedStatuses(actor);
  if (!allowed.includes(before.job_status)) {
    throw cancelError(
      `Cannot cancel job in status ${before.job_status}`,
      409,
      "JOB_NOT_CANCELLABLE",
      { job_status: before.job_status }
    );
  }

  let refundDecision = null;
  if (before.payment_status === "paid") {
    if (actor !== "admin") {
      throw cancelError(
        "This job has already been paid — please contact support for a refund",
        409,
        "JOB_PAID"
      );
    }
    refundDecision = validateRefundDecision(
      refund,
      before,
      await paidTotalForJob(before)
    );
  }

  const now = new Date();
  const set = {
    job_status: "cancelled",
    cancelled_at: now,
    cancelled_by: actor,
    cancellation_reason: cancellationReason.slice(0, 500),
    cancel_fee_due: !!feeDue,
  };
  if (refundDecision) {
    set.cancellation_refund = {
      decision: refundDecision.decision,
      amount: refundDecision.amount,
      reason: refundDecision.reason,
      decided_by: actor === "admin" && actorId ? actorId : null,
      decided_at: now,
    };
  }
  const update = { $set: set };
  if (actor === "technician") {
    set.rejection_description = cancellationReason.slice(0, 500);
    update.$push = { rejection_reasons: cancellationReason.slice(0, 200) };
  }

  const job = await Job.findOneAndUpdate(
    {
      _id: jobId,
      job_status: { $in: allowed },
      // CAS on the payment status we validated: a payment landing in between
      // makes this miss instead of cancelling a freshly paid job unrefunded.
      payment_status: before.payment_status,
    },
    update,
    { new: true }
  );

  if (!job) {
    const current = await Job.findById(jobId).select(
      "job_status payment_status cancelled_by"
    );
    if (current?.job_status === "cancelled") {
      return { job: await Job.findById(jobId), alreadyCancelled: true };
    }
    throw cancelError(
      `Job is no longer cancellable (status ${current?.job_status}, payment ${current?.payment_status})`,
      409,
      "JOB_NOT_CANCELLABLE",
      { job_status: current?.job_status }
    );
  }

  if (refundDecision && refundDecision.decision !== "none") {
    // INTEGRATION(ws-d): requestRefund({ jobId, amount, reason, requestedBy, source: "cancel" })
    // jobId: job._id, amount: refundDecision.amount, reason: refundDecision.reason,
    // requestedBy: actorId. The decision is already persisted on
    // job.cancellation_refund so finance can see it until the refund service lands.
  }

  if (job.sos_request_id) {
    await SOSRequest.updateOne(
      {
        _id: job.sos_request_id,
        job_id: job._id,
        status: { $nin: ["cancelled", "completed"] },
      },
      {
        $set: {
          status: "cancelled",
          outcome: "cancelled",
          cancel_reason: cancellationReason.slice(0, 500),
        },
      }
    ).catch((err) => {
      console.error("[cancelJob] SOS outcome write failed:", err.message);
    });
  }

  await markServiceRequestForJob(job, "cancelled", {
    reason: cancellationReason,
  }).catch((err) => {
    console.error("[cancelJob] service request terminal write failed:", err.message);
  });

  const technicianId = job.assignedTechnician ? String(job.assignedTechnician) : null;
  let technicianNextStatus = null;
  if (technicianId) {
    const shouldCount =
      countAgainstTechnician != null ? countAgainstTechnician : actor !== "admin";
    if (shouldCount) {
      const TechnicianEarnings = require("../models/TechnicianEarnings");
      await TechnicianEarnings.findOneAndUpdate(
        { technician_id: technicianId },
        {
          $inc: { "performance.total_cancelled_jobs": 1 },
          $set: { updated_at: new Date() },
        },
        { upsert: true }
      ).catch((err) => console.error("[cancelJob] earnings counter:", err.message));
      if (actor === "technician") {
        const Technician = require("../models/Technician");
        await Technician.updateOne(
          { _id: technicianId },
          { $inc: { "performance.cancelledJobs": 1 } }
        ).catch((err) => console.error("[cancelJob] tech counter:", err.message));
      }
    }
    technicianNextStatus = await resolveTechnicianStatusAfterJob(technicianId, job._id);
    await setTechnicianStatus(technicianId, technicianNextStatus);
  }

  const payload = {
    job_id: String(job._id),
    status: "cancelled",
    reason: cancellationReason,
    cancelled_by: actor,
    cancelled_at: now,
    cancel_fee_due: !!job.cancel_fee_due,
    ...(job.sos_request_id ? { sos_id: String(job.sos_request_id) } : {}),
  };

  if (technicianId && technicianNextStatus) {
    await safeNotify(notifier.technicianPresence, technicianId, technicianNextStatus);
  }
  if (job.customer_id) {
    await safeNotify(
      notifier.customerJobEvent,
      String(job.customer_id),
      "jobCancelled",
      payload
    );
  }
  if (technicianId && actor !== "technician") {
    await safeNotify(notifier.technicianJobEvent, technicianId, "jobCancelled", payload);
  }

  return {
    job,
    before,
    alreadyCancelled: false,
    technicianId,
    technicianNextStatus,
    refund: refundDecision,
    payload,
  };
}

module.exports = {
  cancelJob,
  validateRefundDecision,
  ADMIN_CANCELLABLE_STATUSES,
  TECHNICIAN_CANCELLABLE_STATUSES,
  REFUND_DECISIONS,
};
