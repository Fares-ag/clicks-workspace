const mongoose = require("mongoose");

const PasswordResetSchema = new mongoose.Schema({
  email: { type: String, required: true },
  token: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  used: { type: Boolean, default: false },
  // Brute-force guard. Incremented atomically on each wrong guess in
  // authController.resetPassword; the record is destroyed at 5.
  attempts: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

// Index to automatically delete expired tokens
PasswordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("PasswordReset", PasswordResetSchema);
