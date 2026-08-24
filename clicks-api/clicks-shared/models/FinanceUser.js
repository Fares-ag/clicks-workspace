const mongoose = require("mongoose");

const FinanceUserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, default: "", trim: true },
    password: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ["admin", "operator"],
      default: "operator",
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

FinanceUserSchema.index({ phone: 1 });

module.exports = mongoose.model("FinanceUser", FinanceUserSchema);
