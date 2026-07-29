const mongoose = require("mongoose");

const BusinessSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, default: "" },
    email: { type: String, default: "" },
    address: { type: String, default: "" },
    cutType: {
      type: String,
      enum: ["revenue", "profit"],
      default: "revenue",
    },
    cutPercent: { type: Number, min: 0, max: 100, default: 0 },
    isActive: { type: Boolean, default: true },
    defaultSource: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Source",
      default: null,
    },
  },
  { timestamps: true }
);

BusinessSchema.index({ name: 1 });
BusinessSchema.index({ isActive: 1 });

module.exports = mongoose.model("Business", BusinessSchema);
