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
  },
  { timestamps: true }
);

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
