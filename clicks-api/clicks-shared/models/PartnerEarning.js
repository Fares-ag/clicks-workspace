const mongoose = require("mongoose");

const PartnerEarningSchema = new mongoose.Schema(
  {
    partner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Partner",
      required: true,
      index: true,
    },
    job: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
      unique: true,
    },
    amount: { type: Number, required: true, min: 0 },
    period: { type: Number, required: true, min: 1 },
    /**
     * True once this row's amount has been added to Partner.accruedTotal.
     * The row alone only proves intent — `applied` is what makes a retry safe:
     * false means a previous attempt died before moving the aggregate.
     */
    applied: { type: Boolean, default: false },
    applied_at: { type: Date, default: null },
  },
  { timestamps: true }
);

PartnerEarningSchema.index({ partner: 1, createdAt: -1 });

module.exports = mongoose.model("PartnerEarning", PartnerEarningSchema);
