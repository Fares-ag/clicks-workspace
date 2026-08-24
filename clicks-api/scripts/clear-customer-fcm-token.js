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
  const r = await Customer.findOneAndUpdate(
    { phone_number: "+97433333333" },
    { $unset: { fcm_token: 1 } },
    { new: true }
  ).select("phone_number fcm_token first_name");
  console.log(
    "cleared FCM for",
    r?.phone_number,
    "token_now=",
    r?.fcm_token ?? null
  );
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
