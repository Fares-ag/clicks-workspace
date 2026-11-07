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
        "scheduled",
        "not_a_job",
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
    outcome: {
      type: String,
      enum: ["job_created", "scheduled", "not_a_job", "cancelled", "expired"],
      default: null,
    },
    outcome_reason: { type: String, default: "" },
    scheduled_request_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServiceRequest",
      default: null,
    },
    after_hours: { type: Boolean, default: false },
    next_open_at: { type: Date, default: null },
    // Client idempotency key: a replayed createSOS (reconnect, second tap)
    // carries the same id and resolves to this document instead of a new one.
    client_request_id: { type: String, default: null, maxlength: 64 },
    // Location quality as reported by the device (scenario 31).
    accuracy_m: { type: Number, default: null },
    fix_time: { type: Date, default: null },
    location_source: {
      type: String,
      enum: ["gps", "manual_pin", null],
      default: null,
    },
    // Debt the customer still owes when they raised this SOS (scenario 91).
    // Shown to dispatch; it never blocks the SOS.
    outstanding_balance: { type: Number, default: 0 },
    outstanding_job_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: "Job" }],
    // Escalation ladder (sosEscalation sweeper). Every step is a conditional
    // update on escalation_level so a restart or a second instance can't
    // double-send.
    escalation_level: { type: Number, default: 0 },
    last_escalated_at: { type: Date, default: null },
    claim_released_at: { type: Date, default: null },
    claim_release_count: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// One live SOS per customer (scenario 29). The read-then-save guard in
// createSOS can't stop two devices racing; this index can. Production runs
// with autoIndex off — sync-indexes must build it.
SOSRequestSchema.index(
  { customer_id: 1 },
  {
    name: "uniq_active_sos_per_customer",
    unique: true,
    partialFilterExpression: { status: { $in: ["pending", "in_call"] } },
  }
);
SOSRequestSchema.index(
  { customer_id: 1, client_request_id: 1 },
  {
    name: "uniq_sos_client_request_id",
    unique: true,
    partialFilterExpression: { client_request_id: { $type: "string" } },
  }
);
// Escalation sweep: { status, escalation_level, createdAt } and claim release.
SOSRequestSchema.index({ status: 1, escalation_level: 1, createdAt: 1 });
// Create throttle: customer's SOS in the last 10 minutes.
SOSRequestSchema.index({ customer_id: 1, createdAt: -1 });

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
