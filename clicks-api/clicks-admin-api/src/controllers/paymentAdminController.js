const mongoose = require("mongoose");
const {
  Job,
  Receipt,
  Refund,
  PaymentAttempt,
} = require("../../../clicks-shared/models");
const { markJobPaidManually } = require("../../../clicks-shared/services/jobPayment");
const {
  requestRefund,
  approveRefund,
  rejectRefund,
  listRefunds,
} = require("../../../clicks-shared/services/refunds");
const {
  listFailedOutboxEvents,
  replayOutboxEvent,
} = require("../../../clicks-shared/services/outboxWorker");
const { buildCreditNotePdf } = require("../../../clicks-shared/services/receiptPdf");
const { recordAudit, serializeAuditValue } = require("../utils/auditLog");

/** Admins who may approve a refund (a different person must have requested it). */
const ADMIN_REFUND_APPROVERS = new Set(["Super Admin"]);
/** Finance portal role that may approve refunds. */
const FINANCE_REFUND_APPROVER = "admin";

function actorFromReq(req) {
  if (req.financeUser) {
    return {
      type: "finance",
      id: String(req.financeUser._id),
      role: req.financeUser.role || "",
      name: req.financeUser.name || "",
    };
  }
  return {
    type: "admin",
    id: req.user?.id ? String(req.user.id) : null,
    role: req.user?.role || "",
    name: "",
  };
}

function canApproveRefunds(req) {
  if (req.financeUser) return req.financeUser.role === FINANCE_REFUND_APPROVER;
  return ADMIN_REFUND_APPROVERS.has(req.user?.role);
}

function sendError(res, err, fallback) {
  const status = err.status || 500;
  return res.status(status).json({
    message: err.message || fallback,
    error: err.message || fallback,
    code: err.code,
    refund: err.refund || undefined,
  });
}

const JOB_SUMMARY_FIELDS =
  "job_reference clientName clientMobileNumber job_status payment_status payment_method price refunded_amount";

/**
 * Admin / finance refund and ledger screens show which job a row is about.
 * Adds `job` (a small summary, or null) next to each row's raw job_id.
 */
async function withJobSummaries(rows) {
  const ids = [
    ...new Set(
      (rows || [])
        .map((row) => (row?.job_id ? String(row.job_id) : ""))
        .filter((id) => mongoose.isValidObjectId(id))
    ),
  ];
  if (ids.length === 0) return (rows || []).map((row) => ({ ...row, job: null }));
  const jobs = await Job.find({ _id: { $in: ids } }).select(JOB_SUMMARY_FIELDS).lean();
  const byId = new Map(jobs.map((job) => [String(job._id), job]));
  return rows.map((row) => ({
    ...row,
    job: row?.job_id ? byId.get(String(row.job_id)) || null : null,
  }));
}

function skipcashFetchFor(req) {
  return req.app.get("skipcashFetch") || undefined;
}

async function markJobPaid(req, res, { finance }) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(404).json({ message: "Job not found" });
    const method = req.body?.payment_method || (finance ? "" : "waived");
    if (finance && method === "waived") {
      return res.status(403).json({
        message: "Waiving a balance is an admin action",
        code: "WAIVE_ADMIN_ONLY",
      });
    }
    const before = await Job.findById(id).lean();
    const actor = actorFromReq(req);
    const result = await markJobPaidManually({
      jobId: id,
      method,
      reference: req.body?.reference,
      reason: req.body?.reason,
      actor: { type: actor.type, id: actor.id },
    });
    if (!result.alreadyPaid) {
      await recordAudit({
        req,
        action: method === "waived" ? "job.payment_waived" : "job.mark_paid",
        entityType: "job",
        entityId: id,
        changes: {
          payment_status: { from: before?.payment_status, to: result.job?.payment_status },
          payment_method: { from: before?.payment_method || null, to: result.job?.payment_method },
          reference: serializeAuditValue(req.body?.reference || ""),
          reason: serializeAuditValue(req.body?.reason || ""),
          actor_type: actor.type,
        },
      });
    }
    return res.status(result.alreadyPaid ? 409 : 200).json({
      message: result.alreadyPaid ? "Job is already paid" : "Job marked paid",
      code: result.alreadyPaid ? "ALREADY_PAID" : undefined,
      job: result.job,
      receipt: result.receipt,
    });
  } catch (err) {
    return sendError(res, err, "Failed to mark job paid");
  }
}

const markJobPaidByAdmin = (req, res) => markJobPaid(req, res, { finance: false });
const markJobPaidByFinance = (req, res) => markJobPaid(req, res, { finance: true });

async function listRefundsHandler(req, res) {
  try {
    const data = await listRefunds({
      status: req.query.status,
      jobId: req.query.job_id,
      subscriptionId: req.query.subscription_id,
      page: req.query.page,
      limit: req.query.limit,
    });
    res.json({ ...data, refunds: await withJobSummaries(data.refunds) });
  } catch (err) {
    sendError(res, err, "Failed to list refunds");
  }
}

async function getRefundHandler(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: "Refund not found" });
    }
    const refund = await Refund.findById(req.params.id).lean();
    if (!refund) return res.status(404).json({ message: "Refund not found" });
    const [withJob] = await withJobSummaries([refund]);
    res.json({ refund: withJob });
  } catch (err) {
    sendError(res, err, "Failed to fetch refund");
  }
}

async function requestRefundHandler(req, res) {
  try {
    const { job_id, subscription_id, amount, reason, attempt_id } = req.body || {};
    const refund = await requestRefund({
      jobId: job_id || undefined,
      subscriptionId: subscription_id || undefined,
      amount: amount == null || amount === "" ? undefined : Number(amount),
      reason,
      requestedBy: actorFromReq(req),
      source: req.financeUser ? "finance" : "admin",
      attemptId: attempt_id || undefined,
    });
    await recordAudit({
      req,
      action: "refund.request",
      entityType: "refund",
      entityId: refund._id,
      changes: {
        job_id: serializeAuditValue(refund.job_id),
        subscription_id: serializeAuditValue(refund.subscription_id),
        amount: refund.amount,
        reason: refund.reason,
      },
    });
    res.status(201).json({ refund });
  } catch (err) {
    sendError(res, err, "Failed to request refund");
  }
}

async function approveRefundHandler(req, res) {
  try {
    if (!canApproveRefunds(req)) {
      return res.status(403).json({
        message: "Your role cannot approve refunds",
        code: "REFUND_APPROVER_ROLE",
      });
    }
    const refund = await approveRefund({
      refundId: req.params.id,
      approvedBy: actorFromReq(req),
      fetchImpl: skipcashFetchFor(req),
      manualReference: req.body?.manual_reference,
    });
    await recordAudit({
      req,
      action: "refund.approve",
      entityType: "refund",
      entityId: refund._id,
      changes: {
        status: refund.status,
        amount: refund.amount,
        provider_refund_id: refund.provider_refund_id || "",
        manual_reference: refund.manual_reference || "",
        credit_note_number: refund.credit_note_number || "",
      },
    });
    res.json({ refund });
  } catch (err) {
    if (err.refund) {
      await recordAudit({
        req,
        action: "refund.approve_failed",
        entityType: "refund",
        entityId: err.refund._id,
        changes: { error: err.message },
      });
    }
    sendError(res, err, "Failed to approve refund");
  }
}

async function rejectRefundHandler(req, res) {
  try {
    if (!canApproveRefunds(req)) {
      return res.status(403).json({
        message: "Your role cannot decide refunds",
        code: "REFUND_APPROVER_ROLE",
      });
    }
    const refund = await rejectRefund({
      refundId: req.params.id,
      rejectedBy: actorFromReq(req),
      reason: req.body?.reason,
    });
    await recordAudit({
      req,
      action: "refund.reject",
      entityType: "refund",
      entityId: refund._id,
      changes: { reason: refund.rejection_reason },
    });
    res.json({ refund });
  } catch (err) {
    sendError(res, err, "Failed to reject refund");
  }
}

async function creditNotePdfHandler(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: "Refund not found" });
    }
    const refund = await Refund.findById(req.params.id).lean();
    if (!refund || refund.status !== "succeeded" || !refund.job_id) {
      return res.status(404).json({ message: "No credit note for this refund" });
    }
    const receipt = await Receipt.findOne({ job_id: refund.job_id }).lean();
    const creditNote = (receipt?.credit_notes || []).find(
      (note) => String(note.refund_id) === String(refund._id)
    );
    if (!receipt || !creditNote) {
      return res.status(404).json({ message: "No credit note for this refund" });
    }
    const job = await Job.findById(refund.job_id)
      .populate("customer_id", "first_name last_name phone_number email client_id")
      .lean();
    const pdf = await buildCreditNotePdf({ receipt, job, refund, creditNote });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="sanadcom-credit-note-${creditNote.number}.pdf"`
    );
    return res.send(pdf);
  } catch (err) {
    sendError(res, err, "Failed to build credit note");
  }
}

async function listJobAttempts(req, res) {
  try {
    const filter = {};
    if (req.query.job_id && mongoose.isValidObjectId(req.query.job_id)) filter.job_id = req.query.job_id;
    if (req.query.subscription_id && mongoose.isValidObjectId(req.query.subscription_id)) {
      filter.subscription_id = req.query.subscription_id;
    }
    if (req.query.status) filter.status = String(req.query.status);
    if (req.query.outcome) filter.outcome = String(req.query.outcome);
    if (req.query.stale === "1" || req.query.stale === "true") {
      filter.status = "pending";
      filter.createdAt = { $lt: new Date(Date.now() - 48 * 60 * 60 * 1000) };
    }
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const attempts = await PaymentAttempt.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ attempts: await withJobSummaries(attempts) });
  } catch (err) {
    sendError(res, err, "Failed to list payment attempts");
  }
}

async function listFailedOutbox(req, res) {
  try {
    res.json(
      await listFailedOutboxEvents({
        page: req.query.page,
        limit: req.query.limit,
        type: req.query.type,
      })
    );
  } catch (err) {
    sendError(res, err, "Failed to list outbox events");
  }
}

async function replayOutbox(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: "Event not found" });
    }
    const result = await replayOutboxEvent(req.params.id);
    if (!result.event) return res.status(404).json({ message: "Event not found" });
    if (!result.replayed) {
      return res.status(409).json({
        message: `Event is ${result.event.status}, only failed events can be replayed`,
        event: result.event,
      });
    }
    await recordAudit({
      req,
      action: "outbox.replay",
      entityType: "outbox_event",
      entityId: result.event._id,
      changes: { type: result.event.type, delivered: result.delivered },
    });
    res.json(result);
  } catch (err) {
    sendError(res, err, "Failed to replay outbox event");
  }
}

module.exports = {
  markJobPaidByAdmin,
  markJobPaidByFinance,
  listRefundsHandler,
  getRefundHandler,
  requestRefundHandler,
  approveRefundHandler,
  rejectRefundHandler,
  creditNotePdfHandler,
  listJobAttempts,
  listFailedOutbox,
  replayOutbox,
  canApproveRefunds,
};
