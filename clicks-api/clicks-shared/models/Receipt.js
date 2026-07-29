const mongoose = require("mongoose");

const ReceiptSchema = new mongoose.Schema({
  // job_id is optional — settlements have no associated job
  job_id: { type: mongoose.Schema.Types.ObjectId, ref: "Job" },
  // customer_id is optional — admin-created jobs may have no linked customer account
  customer_id: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
  technician_id: { type: mongoose.Schema.Types.ObjectId, ref: "Technician", required: true },
  total_amount: { type: Number, required: true },
  payment_status: { type: String, enum: ["pending", "paid", "confirmed"], default: "pending" },
  issued_at: { type: Date, default: Date.now },
  items: [
    {
      description: String,
      quantity: Number,
      price: Number,
      receipt_image_url: String
    }
  ],
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

module.exports = mongoose.model("Receipt", ReceiptSchema);
