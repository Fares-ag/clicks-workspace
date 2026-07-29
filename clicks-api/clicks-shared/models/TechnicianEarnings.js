const mongoose = require("mongoose");

const TechnicianEarningsSchema = new mongoose.Schema({
  technician_id: { type: mongoose.Schema.Types.ObjectId, ref: "Technician", required: true },
  total_earned: { type: Number, default: 0 },
  cash_balance: { type: Number, default: 0 },
  weekly_earnings: [
    {
      week_start: Date,
      week_end: Date,
      amount: Number,
      jobs_completed: Number,
      jobs_rejected: Number,
      jobs_cancelled: Number,
      hours_online: Number
    }
  ],
  performance: {
    total_completed_jobs: { type: Number, default: 0 },
    total_rejected_jobs: { type: Number, default: 0 },
    total_cancelled_jobs: { type: Number, default: 0 }
  },
  updated_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model("TechnicianEarnings", TechnicianEarningsSchema);
