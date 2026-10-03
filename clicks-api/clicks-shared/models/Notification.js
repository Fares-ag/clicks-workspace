const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema(
  {
    audience: {
      type: String,
      enum: ["admin"],
      required: true,
      index: true,
    },
    type: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, default: "", trim: true },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    read_by: [{ type: mongoose.Schema.Types.ObjectId, ref: "Admin" }],
  },
  { timestamps: true }
);

NotificationSchema.index({ audience: 1, createdAt: -1 });
NotificationSchema.index({ audience: 1, read_by: 1, createdAt: -1 });
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model("Notification", NotificationSchema);
