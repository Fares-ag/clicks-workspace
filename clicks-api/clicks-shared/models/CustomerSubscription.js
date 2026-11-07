const mongoose = require("mongoose");

const UsageSchema = new mongoose.Schema(
  {
    bucket: { type: String, default: "", trim: true },
    serviceType: { type: String, default: "", trim: true },
    used: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const CustomerSubscriptionSchema = new mongoose.Schema(
  {
    customer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },
    customer_vehicle_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CustomerVehicle",
      required: true,
    },
    plan_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubscriptionPlan",
      required: true,
    },
    planCode: { type: String, default: "", trim: true },
    planName: { type: String, default: "", trim: true },
    interval: { type: String, enum: ["month", "year"], required: true },
    durationMonths: { type: Number, required: true, min: 1 },
    priceQar: { type: Number, required: true, min: 0 },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    included: { type: Array, default: [] },
    eligibleServiceTypes: { type: [String], default: [] },
    status: {
      type: String,
      enum: ["pending_payment", "active", "expired", "cancelled"],
      default: "pending_payment",
      index: true,
    },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    usage: { type: [UsageSchema], default: [] },
    skipcash: {
      payment_id: { type: String, default: "" },
      pay_url: { type: String, default: "" },
      transaction_id: { type: String, default: "" },
      status_id: { type: Number, default: null },
      visa_id: { type: String, default: "" },
      amount: { type: String, default: "" },
      created_at: { type: Date, default: null },
    },
    source: { type: String, enum: ["app", "admin"], default: "app" },
  },
  { timestamps: true }
);

CustomerSubscriptionSchema.index(
  { customer_vehicle_id: 1 },
  {
    unique: true,
    name: "active_membership_per_vehicle",
    partialFilterExpression: { status: "active" },
  }
);
CustomerSubscriptionSchema.index(
  { "skipcash.payment_id": 1 },
  { sparse: true }
);
CustomerSubscriptionSchema.index({ customer_id: 1, status: 1 });

CustomerSubscriptionSchema.methods.resolveStatus = function resolveStatus(
  now = new Date()
) {
  if (this.status === "cancelled" || this.status === "pending_payment") {
    return this.status;
  }
  if (this.endDate && new Date(this.endDate) < now) return "expired";
  return this.status;
};

module.exports = mongoose.model(
  "CustomerSubscription",
  CustomerSubscriptionSchema
);
