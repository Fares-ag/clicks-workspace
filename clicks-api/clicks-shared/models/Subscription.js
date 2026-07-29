const mongoose = require("mongoose");

const SubscriptionSchema = new mongoose.Schema(
  {
    clientName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    plateNumber: { type: String, required: true, trim: true, index: true },
    vinNumber: { type: String, default: "", trim: true },
    planName: { type: String, required: true, trim: true },
    durationMonths: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ["active", "expired", "cancelled"],
      default: "active",
    },
    created_by_technician: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Technician",
      default: null,
    },
    createdByTechnicianName: { type: String, default: "" },
    created_by_admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  { timestamps: true }
);

SubscriptionSchema.index({ plateNumber: 1, status: 1 });

/** Derive active/expired from dates unless explicitly cancelled. */
SubscriptionSchema.methods.resolveStatus = function resolveStatus(now = new Date()) {
  if (this.status === "cancelled") return "cancelled";
  if (this.endDate && new Date(this.endDate) < now) return "expired";
  if (this.startDate && new Date(this.startDate) > now) return "active";
  return "active";
};

module.exports = mongoose.model("Subscription", SubscriptionSchema);
