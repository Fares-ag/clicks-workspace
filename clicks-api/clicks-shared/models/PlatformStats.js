const mongoose = require("mongoose");

const PlatformStatsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, default: {} },
    computed_at: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PlatformStats", PlatformStatsSchema);
