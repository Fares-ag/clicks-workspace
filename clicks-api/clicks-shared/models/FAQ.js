const mongoose = require("mongoose");

const FAQSchema = new mongoose.Schema(
  {
    question: { type: String, required: true },
    answer: { type: String, required: true },
    category: { type: String }, // Optional: e.g., "General", "Billing", "Technical"
    order: { type: Number, default: 0 }, // For sorting
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model("FAQ", FAQSchema);
