/**
 * Create the Basic + Plus membership plans if they do not exist yet.
 * Existing plans are left as edited in the admin.
 * Usage: node scripts/seed-membership-plans.js [--overwrite]
 *   --overwrite  reset Basic and Plus to the code defaults (undoes admin edits)
 */
const fs = require("fs");
const path = require("path");
const dotenv = require("../clicks-admin-api/node_modules/dotenv");
const envCandidates = [
  path.join(__dirname, "../clicks-admin-api/.env"),
  path.join(__dirname, "../clicks-customer-tech-api/.env"),
];
for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}
const mongoose = require("mongoose");
const { SubscriptionPlan } = require("../clicks-shared/models");
const { seedMembershipPlans } = require("../clicks-shared/services/membershipPlans");

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI missing");
  await mongoose.connect(uri);
  const plans = await seedMembershipPlans(SubscriptionPlan, {
    overwrite: process.argv.includes("--overwrite"),
  });
  for (const plan of plans) {
    console.log(
      `✓ ${plan.code} — ${plan.intervals
        .map((row) => `${row.interval} QAR ${row.priceQar}`)
        .join(", ")}`
    );
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
