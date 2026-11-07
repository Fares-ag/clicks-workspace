/**
 * Live SkipCash sandbox smoke: create a real payment for an in_progress job.
 * Usage (from clicks-api): node scripts/skipcash-sandbox-smoke.js
 */
const fs = require("fs");
const path = require("path");
const envPath = path.join(__dirname, "../clicks-customer-tech-api/.env");
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq < 1) continue;
  const key = trimmed.slice(0, eq).trim();
  if (process.env[key]) continue;
  process.env[key] = trimmed.slice(eq + 1).trim();
}

const { createPayment } = require("../clicks-customer-tech-api/src/services/skipcashClient");
const { getSkipcashConfig } = require("../clicks-shared/utils/skipcash");

async function main() {
  const cfg = getSkipcashConfig();
  if (!cfg.enabled) {
    console.error("SkipCash is disabled — set SKIPCASH_KEY_ID/SECRET/CLIENT_ID");
    process.exit(1);
  }
  console.log("SkipCash env", {
    baseUrl: cfg.baseUrl,
    keyId: cfg.keyId,
    returnUrl: cfg.returnUrl,
  });

  const result = await createPayment({
    amount: "1.00",
    customer: {
      first_name: "Sandbox",
      last_name: "Clicks",
      phone_number: "+97455512345",
      email: "sandbox-skipcash@clicks.qa",
    },
    job: {
      _id: "sandbox-smoke",
      job_reference: "SMOKE1",
      clientName: "Sandbox Clicks",
      clientMobileNumber: "+97455512345",
    },
    transactionId: `smoke${Date.now()}`.slice(0, 40),
    custom1: "sandbox-smoke",
  });

  console.log("SkipCash createPayment", {
    id: result.id,
    statusId: result.statusId,
    payUrl: result.payUrl,
    amount: result.amount,
    currency: result.currency,
  });
  if (!result.payUrl) {
    console.error("No payUrl returned");
    process.exit(1);
  }
  console.log("OK — open payUrl in a browser or the customer WebView to finish the card.");
}

main().catch((err) => {
  console.error(err.message || err);
  if (err.details) console.error(JSON.stringify(err.details, null, 2));
  process.exit(1);
});
