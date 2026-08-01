const mongoose = require("mongoose");

const RepairProcedureSchema = new mongoose.Schema({
  job_id: { type: mongoose.Schema.Types.ObjectId, ref: "Job", required: true },
  technician_id: { type: mongoose.Schema.Types.ObjectId, ref: "Technician", required: true },
  /** Short label for UI tables (e.g. "Wheel"). Falls back to description when empty. */
  name: { type: String, default: "" },
  description: { type: String, required: true },
  /** Per-line technician notes */
  notes: { type: String, default: "" },
  quantity: { type: Number, default: 1 },
  /** Amount charged to the customer for this line */
  price: { type: Number, required: true },
  /** Parts/labor cost for profit calculation */
  cost: { type: Number, default: 0 },
  receipt_image_url: { type: String },
  created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model("RepairProcedure", RepairProcedureSchema);
