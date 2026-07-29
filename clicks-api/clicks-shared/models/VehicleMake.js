const mongoose = require("mongoose");

const VehicleMakeSchema = new mongoose.Schema(
  {
    makeName: { type: String, required: true, unique: true },
    isActive: { type: Boolean, required: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model("VehicleMake", VehicleMakeSchema);
