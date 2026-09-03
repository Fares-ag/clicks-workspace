const mongoose = require("mongoose");

function broadcastMs() {
  const seconds = parseInt(process.env.SOS_BROADCAST_SECONDS || "60", 10);
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 60;
  return safe * 1000;
}

const SOSRequestSchema = new mongoose.Schema(
  {
    customer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    customer_vehicle_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CustomerVehicle",
      // Optional when customer skips vehicle selection (skip_vehicle SOS)
      required: false,
    },
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
    status: {
      type: String,
      enum: [
        "pending",
        "in_call",
        "accepted",
        "cancelled",
        "expired",
        "completed",
      ],
      default: "pending",
    },
    assigned_technician: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Technician",
    },
    cancel_reason: { type: String },
    service_type: { type: String, default: null },
    broadcast_started_at: { type: Date, default: Date.now },
    broadcast_expires_at: { type: Date },
    in_call_at: { type: Date },
    claimed_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
    claimed_at: { type: Date },
    accepted_at: { type: Date },
    job_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
    },
  },
  { timestamps: true }
);

SOSRequestSchema.index({ location: "2dsphere" });
SOSRequestSchema.index({ status: 1, broadcast_expires_at: 1 });
SOSRequestSchema.index({ status: 1, in_call_at: 1 });
SOSRequestSchema.index({ status: 1, createdAt: -1 }); // admin list sort — provenance: getSOSRequests

SOSRequestSchema.pre("save", function (next) {
  if (this.isNew && !this.broadcast_expires_at) {
    const started = this.broadcast_started_at || new Date();
    this.broadcast_started_at = started;
    this.broadcast_expires_at = new Date(started.getTime() + broadcastMs());
  }
  next();
});

module.exports = mongoose.model("SOSRequest", SOSRequestSchema);
module.exports.broadcastMs = broadcastMs;
