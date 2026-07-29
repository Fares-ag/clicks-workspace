const mongoose = require("mongoose");

const VehicleInsuranceSchema = new mongoose.Schema(
  {
    make: { type: mongoose.Schema.Types.ObjectId, ref: "VehicleMake", required: true },
    model: { type: mongoose.Schema.Types.ObjectId, ref: "VehicleModel", required: true },
    year: { type: Number, required: true },
    color: { type: String, required: true },
    plateNumber: { type: String, required: true, unique: true },
    vinNumber: { type: String, required: true, unique: true },
    clientName: { type: String, required: true },
    phoneNumber: { type: String, required: true },
    subscriptionType: {
      type: String,
      required: true,
      enum: ["Full Coverage", "Liability Only"]
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: {
      type: String,
      required: true,
      enum: ["Active", "Inactive"]
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("VehicleInsurance", VehicleInsuranceSchema);
