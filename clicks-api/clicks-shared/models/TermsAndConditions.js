const mongoose = require("mongoose");

const TermsAndConditionsSchema = new mongoose.Schema(
  {
    content: { type: String, required: true },
    version: { type: String, required: true },
    effectiveDate: { type: Date, required: true },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model("TermsAndConditions", TermsAndConditionsSchema);
