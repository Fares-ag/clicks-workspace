const mongoose = require("mongoose");

const VehicleTypeSchema = new mongoose.Schema(
  {
    typeName: { type: String, required: true, unique: true },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model("VehicleType", VehicleTypeSchema);
