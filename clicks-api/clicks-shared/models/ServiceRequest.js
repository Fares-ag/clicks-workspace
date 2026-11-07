const mongoose = require("mongoose");

const ServiceRequestSchema = new mongoose.Schema(
  {
    customer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    customer_vehicle_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CustomerVehicle",
      required: false,
    },
    service_type: { type: String, required: true, trim: true },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
      },
    },
    timing: {
      type: String,
      enum: ["immediate", "scheduled"],
      required: true,
    },
    scheduled_for: { type: Date, default: null },
    status: {
      type: String,
      enum: ["pending", "assigned", "cancelled", "completed"],
      default: "pending",
    },
    cancel_reason: { type: String },
    job_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
    },
    origin_sos_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SOSRequest",
      default: null,
    },
    origin_job_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      default: null,
    },
    membership_cover: {
      type: String,
      enum: ["none", "included", "discounted"],
      default: "none",
    },
    membership_subscription_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CustomerSubscription",
      default: null,
    },
    membership_discount_percent: { type: Number, default: 0, min: 0, max: 100 },
    // Client idempotency key (scenario 53): a resubmitted booking with the same
    // key returns the original request instead of creating a second one.
    client_request_id: { type: String, default: null, maxlength: 64 },
    // Terminal-state audit (scenario 54) — written by serviceRequestLifecycle.
    completed_at: { type: Date, default: null },
    cancelled_at: { type: Date, default: null },
  },
  { timestamps: true }
);

ServiceRequestSchema.index(
  { customer_id: 1, client_request_id: 1 },
  {
    name: "uniq_service_request_client_request_id",
    unique: true,
    partialFilterExpression: { client_request_id: { $type: "string" } },
  }
);
// Terminal-state writes look the request up by its job.
ServiceRequestSchema.index({ job_id: 1 });

ServiceRequestSchema.index({ location: "2dsphere" });
ServiceRequestSchema.index({ status: 1, createdAt: -1 });
ServiceRequestSchema.index({ status: 1, scheduled_for: 1 });
ServiceRequestSchema.index({ customer_id: 1, status: 1, timing: 1 });

ServiceRequestSchema.pre("validate", function (next) {
  if (this.timing === "scheduled") {
    if (!this.scheduled_for) {
      this.invalidate("scheduled_for", "scheduled_for is required for scheduled requests");
    }
  }
  next();
});

module.exports = mongoose.model("ServiceRequest", ServiceRequestSchema);
