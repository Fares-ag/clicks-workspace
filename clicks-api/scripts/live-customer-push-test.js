#!/usr/bin/env node
/**
 * Live customer push test — sends a real FCM notification to the demo customer device.
 *
 * Usage:
 *   node scripts/live-customer-push-test.js
 *   CUSTOMER_PHONE=+97433333333 EVENT=technicianEnRoute node scripts/live-customer-push-test.js
 */
const fs = require("fs");
const path = require("path");

require("../clicks-customer-tech-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-customer-tech-api/.env"),
});
require("../clicks-admin-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-admin-api/.env"),
  override: true,
});

const CUSTOMER_PHONE = process.env.CUSTOMER_PHONE || "+97433333333";
const EVENT = process.env.EVENT || "technicianEnRoute";

function resolveCustomerFirebaseJsonPath() {
  if (
    process.env.FIREBASE_CUSTOMER_JSON_PATH &&
    fs.existsSync(process.env.FIREBASE_CUSTOMER_JSON_PATH)
  ) {
    return process.env.FIREBASE_CUSTOMER_JSON_PATH;
  }
  const assetsDir = path.join(__dirname, "../../clicks-user/assets");
  if (fs.existsSync(assetsDir)) {
    const match = fs
      .readdirSync(assetsDir)
      .find((f) => f.includes("firebase-adminsdk") && f.endsWith(".json"));
    if (match) return path.join(assetsDir, match);
  }
  return null;
}

async function main() {
  console.log("\n=== Live customer push test ===");
  console.log(`Phone: ${CUSTOMER_PHONE}`);
  console.log(`Event: ${EVENT}\n`);

  const jsonPath = resolveCustomerFirebaseJsonPath();
  if (!jsonPath) {
    console.error("FAIL  Firebase customer service account JSON not found");
    process.exit(1);
  }
  process.env.FIREBASE_CUSTOMER_SERVICE_ACCOUNT_JSON = fs.readFileSync(jsonPath, "utf8");

  const mongoose = require("../clicks-shared/node_modules/mongoose");
  const { Customer } = require("../clicks-shared/models");
  await mongoose.connect(process.env.MONGODB_URI);

  const customer = await Customer.findOne({ phone_number: CUSTOMER_PHONE })
    .select("first_name last_name phone_number fcm_token")
    .lean();

  if (!customer) {
    console.error(`FAIL  Customer not found for ${CUSTOMER_PHONE}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const token = customer.fcm_token;
  if (!token || token.length < 80 || token.startsWith("qa_customer_test_token_")) {
    console.error("FAIL  No real FCM token on customer record.");
    console.error("      Install native customer app, log in, allow notifications, then re-run.");
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`OK    Customer: ${customer.first_name || ""} ${customer.last_name || ""}`.trim());
  console.log(`OK    FCM token: ${token.slice(0, 16)}…`);

  const fcmPath = path.join(__dirname, "../clicks-customer-tech-api/src/services/fcmService.js");
  delete require.cache[require.resolve(fcmPath)];
  const { sendCustomerPush, initCustomerFirebase } = require(fcmPath);

  if (!initCustomerFirebase()) {
    console.error("FAIL  Customer Firebase admin failed to initialize");
    await mongoose.disconnect();
    process.exit(1);
  }

  const sent = await sendCustomerPush(customer._id.toString(), {
    event: EVENT,
    type: EVENT,
    job_id: "live-customer-push-test",
  });

  await mongoose.disconnect();

  if (!sent) {
    console.error("\nFAIL  Push not accepted by Firebase (check token / SenderId / Railway creds).");
    process.exit(1);
  }

  console.log("\nPASS  Live push sent via production FCM path.");
  console.log("      Check the customer phone within ~5 seconds (app can be backgrounded or closed).");
}

main().catch((err) => {
  console.error("\nTest aborted:", err.message);
  process.exit(1);
});
