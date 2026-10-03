const mongoose = require("mongoose");

/**
 * Append-only trail of everything a technician does in the technician app.
 *
 * Written by the customer-tech API (REST handlers + socket presence), read by
 * the admin portal's Technician Logs tab. Rows are never updated in place.
 *
 * `technician_id` is nullable on purpose: a login attempt for a phone number
 * that matches no account still has to be recorded (that is the attempt we most
 * want to see), and those rows carry the typed value in `identifier` instead.
 *
 * Retention: TTL on `at`, TECHNICIAN_ACTIVITY_LOG_TTL_DAYS (default 180).
 * Set it to 0 to keep rows forever.
 */
const TTL_DAYS = Number(process.env.TECHNICIAN_ACTIVITY_LOG_TTL_DAYS ?? 180);

const TechnicianActivityLogSchema = new mongoose.Schema(
  {
    technician_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Technician",
      default: null,
      index: true,
    },
    /** Name at the time of the event — survives renames and deletions. */
    technician_name: { type: String, default: "" },
    /** Phone/email as typed by the client. The only identity a failed login has. */
    identifier: { type: String, default: "" },

    event: { type: String, required: true, index: true },
    category: { type: String, required: true, index: true },
    /** success | failure | blocked */
    outcome: { type: String, default: "success", index: true },
    /** Short human sentence rendered in the admin table. */
    message: { type: String, default: "" },
    status_code: { type: Number, default: null },

    job_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      default: null,
    },
    job_reference: { type: String, default: "" },

    /** Event-specific detail (no credentials — see recordTechnicianActivity). */
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },

    ip: { type: String, default: "" },
    user_agent: { type: String, default: "" },
    app_version: { type: String, default: "" },
    platform: { type: String, default: "" },

    /** Where the technician was when the event happened, when known. */
    coordinates: {
      type: { type: String, enum: ["Point"], default: undefined },
      coordinates: { type: [Number], default: undefined },
    },

    at: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false }
);

// Admin list: newest first, optionally scoped to one technician / event / category.
TechnicianActivityLogSchema.index({ at: -1 });
TechnicianActivityLogSchema.index({ technician_id: 1, at: -1 });
TechnicianActivityLogSchema.index({ event: 1, at: -1 });
TechnicianActivityLogSchema.index({ category: 1, at: -1 });
TechnicianActivityLogSchema.index({ outcome: 1, at: -1 });
TechnicianActivityLogSchema.index({ job_id: 1, at: -1 }, { sparse: true });
// Failed-login forensics by typed phone number.
TechnicianActivityLogSchema.index({ identifier: 1, at: -1 }, { sparse: true });

if (Number.isFinite(TTL_DAYS) && TTL_DAYS > 0) {
  TechnicianActivityLogSchema.index(
    { at: 1 },
    { expireAfterSeconds: Math.round(TTL_DAYS * 24 * 60 * 60) }
  );
}

module.exports = mongoose.model(
  "TechnicianActivityLog",
  TechnicianActivityLogSchema
);
