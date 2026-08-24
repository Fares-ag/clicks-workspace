/**
 * Clear stuck pending/in_call SOS for the seeded demo customer.
 * Usage: node scripts/clear-stuck-sos.js
 */
const path = require("path");
require("../clicks-admin-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-customer-tech-api/.env"),
});
const mongoose = require("mongoose");
const { SOSRequest, Customer } = require("../clicks-shared/models");

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const c = await Customer.findOne({ phone_number: "+97433333333" });
  if (!c) {
    console.log("Demo customer not found");
    process.exit(0);
  }
  const r = await SOSRequest.updateMany(
    { customer_id: c._id, status: { $in: ["pending", "in_call"] } },
    {
      $set: {
        status: "expired",
        cancel_reason: "Cleared stuck in_call for local QA",
      },
    }
  );
  console.log("cleared", r.modifiedCount);
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
