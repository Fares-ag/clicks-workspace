const mongoose = require("mongoose");

const SupportTicketSchema = new mongoose.Schema({
  customer_id: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true },
  job_id: { type: mongoose.Schema.Types.ObjectId, ref: "Job" },
  issue_type: { type: String, required: true },
  description: { type: String, required: true },
  status: { type: String, enum: ["open", "in_progress", "resolved", "closed"], default: "open" },
  admin_response: { type: String },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date }
});

module.exports = mongoose.model("SupportTicket", SupportTicketSchema);
