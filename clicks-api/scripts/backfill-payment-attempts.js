/**
 * Create PaymentAttempt ledger rows for SkipCash payments issued before the
 * ledger existed, so the reconciliation sweep (which only reads the ledger)
 * also checks checkouts that were open at deploy time.
 *
 *  - Jobs: one attempt per job.skipcash.payment_id. Unpaid jobs → pending
 *    (the sweep will ask SkipCash). Jobs already paid by card with that id →
 *    paid / applied and linked as the job's paid attempt.
 *  - Memberships: one attempt per CustomerSubscription.skipcash.payment_id.
 *
 * Idempotent (unique provider_payment_id). Dry-run unless --dry-run=false
 * or --confirm is passed.
 *
 * Usage:
 *   node scripts/backfill-payment-attempts.js --dry-run
 *   node scripts/backfill-payment-attempts.js --confirm
 */
const path = require("path");

require("../clicks-admin-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-admin-api/.env"),
});

const mongoose = require("../clicks-shared/mongoose");
const { Job, CustomerSubscription, PaymentAttempt } = require("../clicks-shared/models");

const confirm = process.argv.includes("--confirm") || process.argv.includes("--dry-run=false");

function amountOf(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

async function backfillJobs(summary) {
  const cursor = Job.find({ "skipcash.payment_id": { $nin: ["", null] } })
    .select("skipcash payment_status payment_method customer_id paid_attempt_id paid_at")
    .lean()
    .cursor();
  for await (const job of cursor) {
    const providerId = String(job.skipcash.payment_id);
    if (await PaymentAttempt.exists({ provider_payment_id: providerId })) {
      summary.jobsExisting += 1;
      continue;
    }
    const paidByCard =
      ["paid", "partially_refunded", "refunded"].includes(job.payment_status) &&
      job.payment_method === "card";
    const row = {
      kind: "job",
      job_id: job._id,
      customer_id: job.customer_id || null,
      provider_payment_id: providerId,
      transaction_id: job.skipcash.transaction_id || "",
      visa_id: job.skipcash.visa_id || "",
      amount: amountOf(job.skipcash.amount),
      status: paidByCard ? "paid" : "pending",
      outcome: paidByCard ? "applied" : null,
      provider_status_id: job.skipcash.status_id ?? null,
      pay_url: job.skipcash.pay_url || "",
      paid_at: paidByCard ? job.paid_at || null : null,
      events: [{ source: "backfill", status_id: job.skipcash.status_id ?? null, at: new Date() }],
    };
    if (paidByCard) summary.jobsPaid += 1;
    else summary.jobsPending += 1;
    if (!confirm) continue;
    const created = await PaymentAttempt.create(row).catch((err) => {
      if (err.code === 11000) return null;
      throw err;
    });
    if (created && paidByCard && !job.paid_attempt_id) {
      await Job.updateOne({ _id: job._id, paid_attempt_id: null }, { $set: { paid_attempt_id: created._id } });
    }
  }
}

async function backfillMemberships(summary) {
  const cursor = CustomerSubscription.find({ "skipcash.payment_id": { $nin: ["", null] } })
    .select("skipcash status customer_id priceQar startDate")
    .lean()
    .cursor();
  for await (const sub of cursor) {
    const providerId = String(sub.skipcash.payment_id);
    if (await PaymentAttempt.exists({ provider_payment_id: providerId })) {
      summary.subsExisting += 1;
      continue;
    }
    const paid = sub.status === "active" || Boolean(sub.startDate);
    if (paid) summary.subsPaid += 1;
    else summary.subsPending += 1;
    if (!confirm) continue;
    await PaymentAttempt.create({
      kind: "membership",
      subscription_id: sub._id,
      customer_id: sub.customer_id || null,
      provider_payment_id: providerId,
      transaction_id: sub.skipcash.transaction_id || "",
      amount: amountOf(sub.skipcash.amount || sub.priceQar),
      status: paid ? "paid" : "pending",
      outcome: paid ? "applied" : null,
      provider_status_id: sub.skipcash.status_id ?? null,
      pay_url: sub.skipcash.pay_url || "",
      events: [{ source: "backfill", status_id: sub.skipcash.status_id ?? null, at: new Date() }],
    }).catch((err) => {
      if (err.code !== 11000) throw err;
    });
  }
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI required");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);
  await PaymentAttempt.syncIndexes();
  const summary = {
    mode: confirm ? "write" : "dry-run",
    jobsPending: 0,
    jobsPaid: 0,
    jobsExisting: 0,
    subsPending: 0,
    subsPaid: 0,
    subsExisting: 0,
  };
  await backfillJobs(summary);
  await backfillMemberships(summary);
  console.log(JSON.stringify(summary, null, 2));
  if (!confirm) console.log("Dry-run only — re-run with --confirm to write the ledger rows");
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
