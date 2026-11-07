const mongoose = require("mongoose");

/**
 * One row per provider payment (SkipCash payment id), for jobs and memberships.
 * Every create, webhook, status poll and reconciliation result is appended to
 * `events`, so a charge can never disappear even when the job or membership it
 * was for has already been settled some other way.
 */
const PAYMENT_ATTEMPT_STATUSES = [
  "pending",
  "paid",
  "failed",
  "cancelled",
  "partially_refunded",
  "refunded",
];

/** Higher rank wins. A webhook or poll can only move an attempt upwards. */
const STATUS_RANK = {
  pending: 0,
  failed: 1,
  cancelled: 1,
  paid: 2,
  partially_refunded: 3,
  refunded: 4,
};

const PaymentAttemptEventSchema = new mongoose.Schema(
  {
    source: {
      type: String,
      enum: ["create", "webhook", "poll", "sweep", "checkout", "cancel", "refund", "backfill"],
      required: true,
    },
    status_id: { type: Number, default: null },
    status: { type: String, default: "" },
    amount: { type: String, default: "" },
    transaction_id: { type: String, default: "" },
    note: { type: String, default: "" },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const PaymentAttemptSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ["job", "membership"], required: true },
    job_id: { type: mongoose.Schema.Types.ObjectId, ref: "Job", default: null },
    subscription_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CustomerSubscription",
      default: null,
    },
    customer_id: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", default: null },
    provider: { type: String, enum: ["skipcash"], default: "skipcash" },
    provider_payment_id: { type: String, required: true, trim: true },
    transaction_id: { type: String, default: "" },
    visa_id: { type: String, default: "" },
    /** Amount the provider was asked to charge, 2 decimals. */
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "QAR" },
    status: {
      type: String,
      enum: PAYMENT_ATTEMPT_STATUSES,
      default: "pending",
      index: true,
    },
    provider_status_id: { type: Number, default: null },
    pay_url: { type: String, default: "" },
    events: { type: [PaymentAttemptEventSchema], default: [] },
    /** How a captured payment was treated. Set once, by whoever settles it first. */
    outcome: {
      type: String,
      enum: ["applied", "duplicate_capture", "amount_mismatch", "refunded", null],
      default: null,
    },
    /** Total the job/membership owed when the capture was applied (mismatch review). */
    expected_amount: { type: Number, default: null },
    refunded_amount: { type: Number, default: 0, min: 0 },
    refund_case_id: { type: mongoose.Schema.Types.ObjectId, ref: "Refund", default: null },
    paid_at: { type: Date, default: null },
    last_checked_at: { type: Date, default: null },
    created_by: {
      type: { type: String, default: "" },
      id: { type: mongoose.Schema.Types.ObjectId, default: null },
    },
  },
  { timestamps: true }
);

PaymentAttemptSchema.index({ provider_payment_id: 1 }, { unique: true });
PaymentAttemptSchema.index({ job_id: 1, createdAt: -1 });
PaymentAttemptSchema.index({ subscription_id: 1, createdAt: -1 });
PaymentAttemptSchema.index({ status: 1, createdAt: 1 });

const PaymentAttempt = mongoose.model("PaymentAttempt", PaymentAttemptSchema);

module.exports = PaymentAttempt;
module.exports.PAYMENT_ATTEMPT_STATUSES = PAYMENT_ATTEMPT_STATUSES;
module.exports.STATUS_RANK = STATUS_RANK;
