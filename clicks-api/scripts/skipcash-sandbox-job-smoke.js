/**
 * Live SkipCash + in-progress job: real payUrl, then webhook + Complete.
 * Usage (from clicks-api): node scripts/skipcash-sandbox-job-smoke.js
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

const request = require("supertest");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../tests/helpers/db");
const { seedCustomer, seedCustomerJob } = require("../tests/helpers/seed");
const { customerToken, technicianToken, bearer } = require("../tests/helpers/tokens");
const { signWebhookPayload, getSkipcashConfig } = require("../clicks-shared/utils/skipcash");

async function main() {
  const cfg = getSkipcashConfig();
  if (!cfg.enabled) {
    throw new Error("SkipCash keys missing");
  }
  await connectTestDb();
  const { app } = require("../clicks-customer-tech-api/src/createApp").createTechApp();

  const customer = await seedCustomer();
  const job = await seedCustomerJob({
    customer,
    jobStatus: "in_progress",
    price: 1,
  });
  job.customerSignatureUrl = "https://test.local/signature.png";
  job.customerSignedAt = new Date();
  await job.save();

  const blocked = await request(app)
    .post(`/api/jobs/${job._id}/complete`)
    .set(bearer(technicianToken(job.assignedTechnician)))
    .send({ job_reference: "SMOKE-1" });
  if (blocked.status !== 400) {
    throw new Error(`Expected complete blocked, got ${blocked.status} ${JSON.stringify(blocked.body)}`);
  }

  const session = await request(app)
    .post(`/api/jobs/${job._id}/skipcash/session`)
    .set(bearer(customerToken(customer._id)))
    .send();
  if (session.status !== 200 || !session.body.pay_url) {
    throw new Error(`Session failed ${session.status} ${JSON.stringify(session.body)}`);
  }
  console.log("session", {
    pay_url: session.body.pay_url,
    payment_id: session.body.payment_id,
    amount: session.body.amount,
  });

  const payload = {
    PaymentId: session.body.payment_id,
    Amount: session.body.amount,
    StatusId: 2,
    TransactionId: `smoke${Date.now()}`.slice(0, 40),
    Custom1: job._id.toString(),
    VisaId: "sandbox-visa",
  };
  const hook = await request(app)
    .post("/api/webhooks/skipcash")
    .set("Authorization", signWebhookPayload(payload, cfg.webhookSecret))
    .send(payload);
  if (hook.status !== 200 || hook.body.payment_status !== "paid") {
    throw new Error(`Webhook failed ${hook.status} ${JSON.stringify(hook.body)}`);
  }

  const completed = await request(app)
    .post(`/api/jobs/${job._id}/complete`)
    .set(bearer(technicianToken(job.assignedTechnician)))
    .send({ job_reference: "SMOKE-1" });
  if (completed.status !== 200 || completed.body.job_status !== "completed") {
    throw new Error(`Complete failed ${completed.status} ${JSON.stringify(completed.body)}`);
  }

  console.log("OK — real SkipCash payUrl, webhook marked paid, Complete unblocked.");
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
