const mongoose = require("mongoose");

const TechnicianEarningEntrySchema = new mongoose.Schema({
  technician_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Technician",
    required: true,
    index: true,
  },
  job_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Job",
    required: true,
    unique: true,
  },
  amount: { type: Number, required: true },
  /**
   * True once this entry's amount has been applied to TechnicianEarnings.
   * The row alone only proves intent — `applied` is what makes a retry safe:
   * unset means a previous attempt died before moving the aggregates.
   */
  applied: { type: Boolean, default: false },
  applied_at: { type: Date, default: null },
  created_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model("TechnicianEarningEntry", TechnicianEarningEntrySchema);
