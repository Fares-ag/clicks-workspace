const mongoose = require("mongoose");

const VehicleModelSchema = new mongoose.Schema(
  {
    makeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VehicleMake",
      required: true,
    },
    modelName: { type: String, required: true },
    isActive: { type: Boolean, required: true },
  },
  { timestamps: true }
);

// Same model name can exist under different makes (e.g. "Other", "Civic").
VehicleModelSchema.index({ makeId: 1, modelName: 1 }, { unique: true });

module.exports = mongoose.model("VehicleModel", VehicleModelSchema);
