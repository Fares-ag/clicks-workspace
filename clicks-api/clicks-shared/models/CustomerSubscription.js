const mongoose = require("mongoose");

const UsageSchema = new mongoose.Schema(
  {
    bucket: { type: String, default: "", trim: true },
    serviceType: { type: String, default: "", trim: true },
    used: { type: Number, default: 0, min: 0 },
    /** Held by open jobs: converted to `used` on completion, released on cancel. */
    reserved: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const HistorySchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    by_type: { type: String, default: "system" },
    by_id: { type: mongoose.Schema.Types.ObjectId, default: null },
    note: { type: String, default: "" },
    data: { type: mongoose.Schema.Types.Mixed, default: null },
    at: { type: Date, default: Date.now },
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
      // paid_duplicate: the customer paid, but the vehicle already had an
      // active membership — a refund case is opened instead of activating.
      enum: ["pending_payment", "active", "expired", "cancelled", "paid_duplicate"],
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
    /** Snapshot of the plan flag; null means "follow the plan". */
    coversEmergency: { type: Boolean, default: null },
    /** Granted by an admin without payment. */
    comp: { type: Boolean, default: false },
    cancel_at_period_end: { type: Boolean, default: false },
    cancel_requested_at: { type: Date, default: null },
    cancelled_at: { type: Date, default: null },
    /** e.g. customer_request, account_deleted, admin, superseded */
    cancel_reason: { type: String, default: "" },
    cancelled_by: {
      type: { type: String, default: "" },
      id: { type: mongoose.Schema.Types.ObjectId, default: null },
    },
    paid_at: { type: Date, default: null },
    refunded_amount: { type: Number, default: 0, min: 0 },
    history: { type: [HistorySchema], default: [] },
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
  if (
    this.status === "cancelled" ||
    this.status === "pending_payment" ||
    this.status === "paid_duplicate"
  ) {
    return this.status;
  }
  if (this.endDate && new Date(this.endDate) < now) return "expired";
  return this.status;
};

module.exports = mongoose.model(
  "CustomerSubscription",
  CustomerSubscriptionSchema
);
