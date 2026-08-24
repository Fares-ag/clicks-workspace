#!/usr/bin/env node
const path = require("path");
require("../clicks-customer-tech-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-customer-tech-api/.env"),
});
require("../clicks-admin-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-admin-api/.env"),
  override: true,
});
const mongoose = require("mongoose");
const { Customer } = require("../clicks-shared/models");
(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const rows = await Customer.find({
    fcm_token: { $exists: true, $nin: [null, ""] },
  })
    .select("first_name last_name phone_number fcm_token updatedAt")
    .sort({ updatedAt: -1 })
    .limit(10)
    .lean();
  if (!rows.length) {
    console.log("No customers with FCM tokens.");
  } else {
    for (const c of rows) {
      const t = c.fcm_token || "";
      const real = t.length > 80 && !t.startsWith("qa_customer_test_token_");
      console.log(
        `${real ? "REAL" : "SKIP"} ${c.phone_number} ${c.first_name || ""} ${c.last_name || ""} token=${t.slice(0, 16)}…`
      );
    }
  }
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
