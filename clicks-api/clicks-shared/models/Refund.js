const mongoose = require("mongoose");

const ActorSchema = new mongoose.Schema(
  {
    /** admin | finance | system | customer | provider */
    type: { type: String, default: "system" },
    id: { type: mongoose.Schema.Types.ObjectId, default: null },
    role: { type: String, default: "" },
    name: { type: String, default: "" },
  },
  { _id: false }
);

/**
 * A refund case. Created as `requested` (by a person, or by the system for a
 * duplicate capture / paid duplicate membership), approved by a different
 * person, then executed against SkipCash or recorded with a manual reference.
 */
const RefundSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ["job", "membership"], required: true },
    job_id: { type: mongoose.Schema.Types.ObjectId, ref: "Job", default: null, index: true },
    subscription_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CustomerSubscription",
      default: null,
      index: true,
    },
    attempt_id: { type: mongoose.Schema.Types.ObjectId, ref: "PaymentAttempt", default: null },
    customer_id: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", default: null },
    amount: { type: Number, required: true, min: 0.01 },
    currency: { type: String, default: "QAR" },
    reason: { type: String, required: true, trim: true, maxlength: 1000 },
    /** Where the case came from: admin | finance | duplicate_capture | membership_duplicate | cancellation | provider | system */
    source: { type: String, default: "admin" },
    /** Provider refunds go through SkipCash; cash or portal refunds are `manual`. */
    method: { type: String, enum: ["provider", "manual"], default: "provider" },
    status: {
      type: String,
      enum: ["requested", "processing", "succeeded", "failed", "rejected"],
      default: "requested",
      index: true,
    },
    requested_by: { type: ActorSchema, default: () => ({}) },
    approved_by: { type: ActorSchema, default: null },
    rejected_by: { type: ActorSchema, default: null },
    rejection_reason: { type: String, default: "" },
    provider_refund_id: { type: String, default: "" },
    manual_reference: { type: String, default: "" },
    provider_response: { type: mongoose.Schema.Types.Mixed, default: null },
    error: { type: String, default: "" },
    credit_note_number: { type: String, default: "" },
    approved_at: { type: Date, default: null },
    completed_at: { type: Date, default: null },
    /** When the refund call was accepted by SkipCash (it then settles async). */
    provider_submitted_at: { type: Date, default: null },
    /** Set when SkipCash's refund webhook (StatusId 6) confirms it. */
    provider_confirmed_at: { type: Date, default: null },
    /** Effects on job / receipt / attempt applied exactly once. */
    effects_applied_at: { type: Date, default: null },
  },
  { timestamps: true }
);

RefundSchema.index({ status: 1, createdAt: -1 });
RefundSchema.index(
  { provider_refund_id: 1 },
  {
    unique: true,
    partialFilterExpression: { provider_refund_id: { $type: "string", $gt: "" } },
    name: "unique_provider_refund_id",
  }
);

module.exports = mongoose.model("Refund", RefundSchema);
