const mongoose = require("mongoose");

const RepairProcedureSchema = new mongoose.Schema({
  job_id: { type: mongoose.Schema.Types.ObjectId, ref: "Job", required: true },
  technician_id: { type: mongoose.Schema.Types.ObjectId, ref: "Technician", required: true },
  /** Short label for UI tables (e.g. "Wheel"). Falls back to description when empty. */
  name: { type: String, default: "" },
  description: { type: String, required: true },
  /** Per-line technician notes */
  notes: { type: String, default: "" },
  quantity: {
    type: Number,
    default: 1,
    min: [1, "Quantity must be at least 1"],
    validate: {
      validator: Number.isInteger,
      message: "Quantity must be a whole number",
    },
  },
  /** Amount charged to the customer for this line. Never negative or zero:
   *  discounts are a membership/finance concern, not a technician line item. */
  price: {
    type: Number,
    required: true,
    validate: {
      validator: (v) => Number.isFinite(v) && v > 0,
      message: "Price must be greater than 0",
    },
  },
  /** Parts/labor cost for profit calculation */
  cost: { type: Number, default: 0, min: 0 },
  receipt_image_url: { type: String },
  created_at: { type: Date, default: Date.now }
});

/** Every read of this collection is "the lines for one job" — finance audits, the
 *  job detail view and the admin overview's pending-totals join all filter on it. */
RepairProcedureSchema.index({ job_id: 1 });

module.exports = mongoose.model("RepairProcedure", RepairProcedureSchema);
