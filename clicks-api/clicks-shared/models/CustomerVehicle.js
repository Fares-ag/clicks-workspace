const mongoose = require("mongoose");

const CustomerVehicleSchema = new mongoose.Schema(
  {
    customer_id: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true },
    vehicle_make: { type: mongoose.Schema.Types.ObjectId, ref: "VehicleMake", required: true },
    vehicle_type: { type: mongoose.Schema.Types.ObjectId, ref: "VehicleType", required: true },
    vehicle_model: { type: mongoose.Schema.Types.ObjectId, ref: "VehicleModel", required: true },
    year: { type: Number, required: true },
    vehicle_color: { type: String, required: true },
    plate_number: { type: String, required: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model("CustomerVehicle", CustomerVehicleSchema);
