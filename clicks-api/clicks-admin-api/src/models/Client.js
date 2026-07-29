const mongoose = require("clicks-shared/node_modules/mongoose");

const ClientSchema = new mongoose.Schema(
  {
    clientId: { type: String, required: true, unique: true }, // Auto-generated
    clientName: { type: String, required: true },
    clientEmail: { type: String, required: true, unique: true },
    phoneNumber: { type: String, required: true }, // Qatar +974
    status: {
      type: String,
      required: true,
      enum: ["Active", "Inactive"]
    },
    vehicle: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Client", ClientSchema);
