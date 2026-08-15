const mongoose = require("mongoose");

const OTPVerificationSchema = new mongoose.Schema({
  phone: { type: String, required: true },
  otp: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  purpose: { type: String, enum: ["registration", "password_reset", "verification"], default: "registration" },
  verified: { type: Boolean, default: false },
  // Brute-force guard. Incremented atomically on each wrong guess by
  // clicks-shared/utils/otpVerify.js; the record is destroyed at 5.
  attempts: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now }
});

// Index for faster queries and automatic cleanup
OTPVerificationSchema.index({ phone: 1, purpose: 1 });
OTPVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index for auto-deletion

module.exports = mongoose.model("OTPVerification", OTPVerificationSchema);
