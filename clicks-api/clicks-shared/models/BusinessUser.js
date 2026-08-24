const mongoose = require("mongoose");

const BusinessUserSchema = new mongoose.Schema(
  {
    business_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, default: "", trim: true },
    password: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ["owner", "staff"],
      default: "staff",
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

BusinessUserSchema.index({ phone: 1 });

module.exports = mongoose.model("BusinessUser", BusinessUserSchema);
