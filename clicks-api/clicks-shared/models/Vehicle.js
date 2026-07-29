const mongoose = require("mongoose");

const VehicleSchema = new mongoose.Schema(
  {
    make: { type: mongoose.Schema.Types.ObjectId, ref: "VehicleMake", required: true },
    model: { type: mongoose.Schema.Types.ObjectId, ref: "VehicleModel", required: true },
    type: { type: mongoose.Schema.Types.ObjectId, ref: "VehicleType" },
    year: { type: Number, required: true },
    plateNumber: { type: String, required: true, unique: true },
    vinNumber: { type: String, required: true, unique: true },
    color: { type: String, required: true },
    vehicleImage: { type: String },
    estimaraFront: { type: String },
    estimaraBack: { type: String },
    estimaraExpiration: { type: Date },
    assignedTechnician: { type: mongoose.Schema.Types.ObjectId, ref: "Technician" },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Vehicle", VehicleSchema);
