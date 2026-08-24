const mongoose = require("mongoose");

const FinanceAuditLogSchema = new mongoose.Schema({
  job_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Job",
    required: true,
    index: true,
  },
  action: {
    type: String,
    enum: ["update", "audit", "reopen", "reaudit"],
    required: true,
  },
  finance_revenue: { type: Number, default: null },
  finance_cost_total: { type: Number, default: null },
  finance_net_profit: { type: Number, default: null },
  finance_user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "FinanceUser",
    required: true,
  },
  notes: { type: String, maxlength: 2000 },
  // Mandatory on action "reaudit"; blank on every other action.
  reason: { type: String, default: "", maxlength: 1000 },
  at: { type: Date, default: Date.now },
});

FinanceAuditLogSchema.index({ job_id: 1, at: -1 });

module.exports = mongoose.model("FinanceAuditLog", FinanceAuditLogSchema);
