const Receipt = require("../models/Receipt");
const RepairProcedure = require("../models/RepairProcedure");
const { computeJobPricing } = require("../utils/jobPricing");
const { nextReceiptNumber, nextCreditNoteNumber } = require("./sequence");

function withSession(query, session) {
  return session ? query.session(session) : query;
}

async function findJobReceipt(jobId, session = null) {
  return withSession(Receipt.findOne({ job_id: jobId }).sort({ issued_at: -1 }), session);
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Issue the one receipt for a paid job, or return the one already on file.
 * Line items, base price and membership cover are frozen into the receipt so
 * later edits to repairs can never change what the PDF says was charged.
 *
 * @param {object} job  — a paid Job document (or lean object)
 * @param {{ session?: any, notes?: string }} [options]
 */
async function issueJobReceipt(job, { session = null, notes } = {}) {
  if (!job || !job._id) return null;
  const existing = await findJobReceipt(job._id, session);
  if (existing) return existing;

  const repairs = await withSession(RepairProcedure.find({ job_id: job._id }), session);
  const pricing = computeJobPricing(job, repairs);
  const issuedAt = new Date();
  const doc = {
    job_id: job._id,
    customer_id: job.customer_id?._id || job.customer_id || undefined,
    technician_id: job.assignedTechnician?._id || job.assignedTechnician || undefined,
    receipt_number: await nextReceiptNumber({ session, at: issuedAt }),
    total_amount: round2(pricing.total),
    payment_status: "paid",
    payment_method: job.payment_method || "",
    provider_payment_id:
      job.payment_method === "card" ? String(job.skipcash?.payment_id || "") : "",
    transaction_id:
      job.payment_method === "card" ? String(job.skipcash?.transaction_id || "") : "",
    issued_at: issuedAt,
    items: repairs.map((r) => ({
      description: r.description,
      quantity: r.quantity,
      price: r.price,
      receipt_image_url: r.receipt_image_url,
    })),
    snapshot: {
      base_price: Number(job.price) || 0,
      job_type: job.jobType || "",
      issue: job.issue || "",
      distance_fee: Number(pricing.distanceFee) || 0,
      membership: pricing.membership || null,
      snapshot_at: issuedAt,
    },
    notes: notes || undefined,
  };

  try {
    if (session) {
      const [created] = await Receipt.create([doc], { session });
      return created;
    }
    return await Receipt.create(doc);
  } catch (err) {
    // A concurrent payer already issued it (unique job receipt index).
    if (err.code !== 11000 || session) throw err;
    return findJobReceipt(job._id);
  }
}

/**
 * Record a credit note against a job's receipt after a refund succeeded.
 * Idempotent per refund id.
 */
async function addCreditNote({ jobId, refund, fullyRefunded, session = null }) {
  if (!jobId || !refund) return null;
  const receipt = await findJobReceipt(jobId, session);
  if (!receipt) return null;
  const already = (receipt.credit_notes || []).find(
    (note) => note.refund_id && String(note.refund_id) === String(refund._id)
  );
  if (already) return { receipt, creditNote: already };

  const number = await nextCreditNoteNumber({ session });
  const note = {
    number,
    amount: round2(refund.amount),
    reason: refund.reason || "",
    refund_id: refund._id,
    provider_refund_id: refund.provider_refund_id || "",
    manual_reference: refund.manual_reference || "",
    issued_at: new Date(),
  };
  const opts = { new: true };
  if (session) opts.session = session;
  const updated = await Receipt.findOneAndUpdate(
    { _id: receipt._id, "credit_notes.refund_id": { $ne: refund._id } },
    {
      $push: { credit_notes: note },
      $inc: { refunded_amount: note.amount },
      $set: { payment_status: fullyRefunded ? "refunded" : "partially_refunded" },
    },
    opts
  );
  return { receipt: updated || receipt, creditNote: note };
}

module.exports = {
  issueJobReceipt,
  findJobReceipt,
  addCreditNote,
};
