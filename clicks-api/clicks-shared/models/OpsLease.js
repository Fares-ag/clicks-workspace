const mongoose = require("mongoose");

/** Named, expiring leases so one instance runs a sweeper / holds a lock at a time. */
const OpsLeaseSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    holder: { type: String, required: true },
    expires_at: { type: Date, required: true },
    acquired_at: { type: Date, default: Date.now },
  },
  { versionKey: false, collection: "ops_leases" }
);

module.exports = mongoose.model("OpsLease", OpsLeaseSchema);
