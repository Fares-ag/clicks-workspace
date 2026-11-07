const mongoose = require("mongoose");

const CreditNoteSchema = new mongoose.Schema(
  {
    number: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    reason: { type: String, default: "" },
    refund_id: { type: mongoose.Schema.Types.ObjectId, ref: "Refund", default: null },
    provider_refund_id: { type: String, default: "" },
    manual_reference: { type: String, default: "" },
    issued_at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ReceiptSchema = new mongoose.Schema({
  // job_id is optional — settlements have no associated job
  job_id: { type: mongoose.Schema.Types.ObjectId, ref: "Job" },
  // customer_id is optional — admin-created jobs may have no linked customer account
  customer_id: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
  // Optional: a card payment can land on a job before a technician is attached.
  technician_id: { type: mongoose.Schema.Types.ObjectId, ref: "Technician" },
  /**
   * Sequential number, REC-<Qatar year>-000001, assigned atomically when the
   * receipt is issued. Receipts issued before numbering existed keep their
   * legacy REC-YYYYMMDD-XXXX number, derived at render time.
   */
  receipt_number: { type: String, default: undefined },
  total_amount: { type: Number, required: true },
  payment_status: {
    type: String,
    enum: ["pending", "paid", "confirmed", "partially_refunded", "refunded"],
    default: "pending",
  },
  payment_method: { type: String, default: "" },
  provider_payment_id: { type: String, default: "" },
  transaction_id: { type: String, default: "" },
  issued_at: { type: Date, default: Date.now },
  items: [
    {
      description: String,
      quantity: Number,
      price: Number,
      receipt_image_url: String
    }
  ],
  /**
   * Frozen copy of what was charged when the receipt was issued, so the PDF
   * never rebuilds lines from repairs edited afterwards.
   */
  snapshot: {
    base_price: { type: Number, default: undefined },
    job_type: { type: String, default: undefined },
    issue: { type: String, default: undefined },
    distance_fee: { type: Number, default: undefined },
    membership: { type: mongoose.Schema.Types.Mixed, default: undefined },
    snapshot_at: { type: Date, default: undefined },
  },
  refunded_amount: { type: Number, default: 0 },
  credit_notes: { type: [CreditNoteSchema], default: [] },
  notes: { type: String }
});

// Partial unique index: enforces one receipt per job, but only when job_id is
// actually set to an ObjectId. Settlement receipts (job_id absent/null) are
// excluded from the index so multiple settlements can coexist.
// Primary protection against duplicates is the idempotency guard in confirmPayment;
// this index is the secondary database-level defence.
ReceiptSchema.index(
  { job_id: 1 },
  {
    unique: true,
    partialFilterExpression: { job_id: { $type: "objectId" } },
    name: "unique_job_receipt",
  }
);
ReceiptSchema.index(
  { receipt_number: 1 },
  {
    unique: true,
    partialFilterExpression: { receipt_number: { $type: "string" } },
    name: "unique_receipt_number",
  }
);

module.exports = mongoose.model("Receipt", ReceiptSchema);
