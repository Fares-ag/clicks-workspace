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
  },
  { timestamps: true }
);

PartnerEarningSchema.index({ partner: 1, createdAt: -1 });

module.exports = mongoose.model("PartnerEarning", PartnerEarningSchema);
