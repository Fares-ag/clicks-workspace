/**
 * Live SkipCash membership checkout: real payUrl, then webhook activates the sub.
 * Usage (from clicks-api): node scripts/skipcash-sandbox-membership-smoke.js
 *
 * Mirrors skipcash-sandbox-job-smoke.js. Requires SkipCash sandbox keys and
 * LAUNCH_CUSTOMER_MEMBERSHIP=true (default outside production).
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
  if (!process.env[key]) process.env[key] = trimmed.slice(eq + 1).trim();
}

process.env.NODE_ENV = process.env.NODE_ENV || "development";
process.env.JWT_SECRET = process.env.JWT_SECRET || "clicks-local-dev-jwt-secret";
process.env.INTERNAL_API_SECRET =
  process.env.INTERNAL_API_SECRET || "clicks-local-internal-api-secret";
process.env.LAUNCH_CUSTOMER_MEMBERSHIP = process.env.LAUNCH_CUSTOMER_MEMBERSHIP || "true";

const request = require("supertest");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../tests/helpers/db");
const { seedCustomer, seedCustomerVehicle } = require("../tests/helpers/seed");
const { customerToken, bearer } = require("../tests/helpers/tokens");
const { signWebhookPayload, getSkipcashConfig } = require("../clicks-shared/utils/skipcash");
const { SubscriptionPlan } = require("../clicks-shared/models");
const { seedMembershipPlans } = require("../clicks-shared/services/membershipPlans");

async function main() {
  const cfg = getSkipcashConfig();
  if (!cfg.enabled) {
    throw new Error("SkipCash keys missing");
  }
  await connectTestDb();
  const { app } = require("../clicks-customer-tech-api/src/createApp").createTechApp();
  await seedMembershipPlans(SubscriptionPlan);

  const customer = await seedCustomer();
  const vehicle = await seedCustomerVehicle(customer);
  const plan = await SubscriptionPlan.findOne({ code: "basic" });

  const checkout = await request(app)
    .post("/api/membership/checkout")
    .set(bearer(customerToken(customer._id)))
    .send({
      plan_id: plan._id.toString(),
      interval: "month",
      customer_vehicle_id: vehicle._id.toString(),
    });
  if (checkout.status !== 200 || !checkout.body.pay_url) {
    throw new Error(`Checkout failed ${checkout.status} ${JSON.stringify(checkout.body)}`);
  }
  console.log("membership session", {
    pay_url: checkout.body.pay_url,
    payment_id: checkout.body.payment_id,
    amount: checkout.body.amount,
    subscription_id: checkout.body.subscription_id,
  });

  const payload = {
    PaymentId: checkout.body.payment_id,
    Amount: checkout.body.amount,
    StatusId: 2,
    TransactionId: `msmoke${Date.now()}`.slice(0, 40),
    Custom1: checkout.body.subscription_id,
    Custom2: "membership",
    VisaId: "sandbox-visa",
  };
  const hook = await request(app)
    .post("/api/webhooks/skipcash")
    .set("Authorization", signWebhookPayload(payload, cfg.webhookSecret))
    .send(payload);
  if (hook.status !== 200 || hook.body.status !== "active") {
    throw new Error(`Webhook failed ${hook.status} ${JSON.stringify(hook.body)}`);
  }

  const status = await request(app)
    .get(`/api/membership/${checkout.body.subscription_id}/status`)
    .set(bearer(customerToken(customer._id)));
  if (status.status !== 200 || status.body.status !== "active") {
    throw new Error(`Status failed ${status.status} ${JSON.stringify(status.body)}`);
  }

  console.log("OK — real SkipCash membership payUrl, webhook activated the subscription.");
  await clearCollections();
  await disconnectTestDb();
}

main().catch(async (err) => {
  console.error(err.message || err);
  if (err.details) console.error(JSON.stringify(err.details, null, 2));
  try {
    await disconnectTestDb();
  } catch (_) {}
  process.exit(1);
});
