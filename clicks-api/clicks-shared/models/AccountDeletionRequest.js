const mongoose = require("mongoose");

const AccountDeletionRequestSchema = new mongoose.Schema(
  {
    appName: { type: String, required: true, default: "Sanad Technician" },
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true },
    phone: { type: String, required: true, trim: true },
    note: { type: String, trim: true },
    status: {
      type: String,
      enum: ["pending", "in_progress", "completed"],
      default: "pending",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "AccountDeletionRequest",
  AccountDeletionRequestSchema
);
