const mongoose = require("mongoose");

const RepairProcedureSchema = new mongoose.Schema({
  job_id: { type: mongoose.Schema.Types.ObjectId, ref: "Job", required: true },
  technician_id: { type: mongoose.Schema.Types.ObjectId, ref: "Technician", required: true },
  description: { type: String, required: true },
  quantity: { type: Number, default: 1 },
  price: { type: Number, required: true },
  receipt_image_url: { type: String },
  created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model("RepairProcedure", RepairProcedureSchema);
