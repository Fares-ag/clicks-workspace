const mongoose = require("mongoose");

/**
 * One row per OTP SMS we were asked to send, kept for 25 hours.
 *
 * OTPVerification rows cannot be used for a per-phone cap: each send deletes
 * the previous code and the TTL removes rows 10 minutes after they are
 * written, so an hourly/daily count over them never sees the history. This
 * collection is append-only and shared by every instance (unlike an
 * in-memory map), so the cap survives deploys and scale-out.
 */
const OtpSendLogSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true },
    purpose: { type: String, default: "" },
    ip: { type: String, default: "" },
    created_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

OtpSendLogSchema.index({ phone: 1, created_at: -1 });
OtpSendLogSchema.index({ created_at: 1 }, { expireAfterSeconds: 25 * 60 * 60 });

module.exports =
  mongoose.models.OtpSendLog || mongoose.model("OtpSendLog", OtpSendLogSchema);
