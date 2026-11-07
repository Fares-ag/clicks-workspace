const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema(
  {
    audience: {
      type: String,
      enum: ["admin", "customer", "technician"],
      required: true,
      index: true,
    },
    customer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
      index: true,
    },
    technician_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Technician",
      default: null,
    },
    type: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, default: "", trim: true },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    read: { type: Boolean, default: false, index: true },
    read_by: [{ type: mongoose.Schema.Types.ObjectId, ref: "Admin" }],
    /** Customer event name (technicianArrived, jobOnHold, ...) — see constants/customerEvents. */
    event: { type: String, default: null },
    /**
     * One row per customer-facing transition: the REST and socket paths, and
     * an outbox retry of a cross-API notify, all resolve to the same key.
     */
    dedupe_key: { type: String, default: undefined },
    /** Set once the socket emit + push went out (outbox delivery idempotency). */
    delivered_at: { type: Date, default: null },
    /** Customer "clear all": hidden from the inbox, kept as the record. */
    cleared_at: { type: Date, default: null },
  },
  { timestamps: true }
);

NotificationSchema.index({ audience: 1, createdAt: -1 });
NotificationSchema.index({ audience: 1, read_by: 1, createdAt: -1 });
NotificationSchema.index({ audience: 1, customer_id: 1, createdAt: -1 });
NotificationSchema.index({ audience: 1, customer_id: 1, read: 1 });
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });
NotificationSchema.index(
  { dedupe_key: 1 },
  { unique: true, partialFilterExpression: { dedupe_key: { $type: "string" } } }
);

module.exports = mongoose.model("Notification", NotificationSchema);
