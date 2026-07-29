const mongoose = require("mongoose");

const SubSourceSchema = new mongoose.Schema({
  name: { type: String, required: true },
  notes: { type: String }
}, { _id: true });

const SourceSchema = new mongoose.Schema(
  {
    mainSourceName: { type: String, required: true, unique: true },
    subSources: [SubSourceSchema],
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Source", SourceSchema);
