const mongoose = require("mongoose");

const PartnerWithdrawalSchema = new mongoose.Schema(
  {
    partner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Partner",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["earnings", "investment", "both"],
      required: true,
    },
    /** Snapshot of investmentAmount at request time */
    investmentAmount: { type: Number, required: true, min: 0 },
    /** Snapshot of earnings (accrued above investment) at request time */
    earningsAmount: { type: Number, required: true, min: 0 },
    /** Cash settlement total for this request */
    totalAmount: { type: Number, required: true, min: 0 },
    period: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "paid", "cancelled"],
      default: "pending",
      index: true,
    },
    partnerNote: { type: String, default: "", maxlength: 1000 },
    adminNote: { type: String, default: "", maxlength: 2000 },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    reviewedAt: { type: Date, default: null },
    paidAt: { type: Date, default: null },
  },
  { timestamps: true }
);

PartnerWithdrawalSchema.index({ partner: 1, createdAt: -1 });
PartnerWithdrawalSchema.index({ partner: 1, status: 1 });

module.exports = mongoose.model("PartnerWithdrawal", PartnerWithdrawalSchema);
