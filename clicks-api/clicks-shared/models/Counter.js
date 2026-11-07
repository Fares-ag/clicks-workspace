const mongoose = require("mongoose");

/**
 * Named monotonic counters: customer client ids (Customer.js defines the same
 * model the same way), receipt and credit-note numbering. Whichever file loads
 * first registers it; the schema is identical.
 */
const CounterSchema = new mongoose.Schema(
  {
    _id: { type: String },
    seq: { type: Number, default: 0 },
  },
  { versionKey: false }
);

module.exports = mongoose.models.Counter || mongoose.model("Counter", CounterSchema);
