const mongoose = require("mongoose");

const PrivacyPolicySchema = new mongoose.Schema(
  {
    content: { type: String, required: true },
    version: { type: String, required: true },
    effectiveDate: { type: Date, required: true },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model("PrivacyPolicy", PrivacyPolicySchema);
