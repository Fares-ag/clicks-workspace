const mongoose = require("mongoose");

const OutboxEventSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    index: true,
  },
  payload: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
  status: {
    type: String,
    enum: ["pending", "sent", "failed"],
    default: "pending",
    index: true,
  },
  attempts: { type: Number, default: 0 },
  next_attempt_at: { type: Date, default: Date.now, index: true },
  last_error: { type: String },
  /** Multi-instance claim lock — not part of status enum. */
  claimed_at: { type: Date, default: null },
  sent_at: { type: Date, default: null },
  created_at: { type: Date, default: Date.now },
});

OutboxEventSchema.index({ status: 1, next_attempt_at: 1, type: 1 });
// TTL: delivered events expire 30 days after sent_at
OutboxEventSchema.index({ sent_at: 1 }, { expireAfterSeconds: 2592000 });

module.exports = mongoose.model("OutboxEvent", OutboxEventSchema);
