#!/usr/bin/env node
/**
 * Anonymise customers whose self-service deletion is older than the retention
 * window (default 30 days, CUSTOMER_ANONYMISE_AFTER_DAYS). The tech API also
 * runs this daily; the script is for backlogs and audits.
 *
 *   node scripts/anonymise-deleted-customers.js --dry-run
 *   node scripts/anonymise-deleted-customers.js --apply [--days=30]
 */
const { parseArgs, connect } = require("./lib/scriptArgs");

async function main() {
  const args = parseArgs();
  const mongoose = await connect();
  const {
    anonymiseDeletedCustomers,
    retentionDays,
  } = require("../clicks-shared/services/anonymiseDeletedCustomers");
  const days = Number(args.value("days", retentionDays()));
  const result = await anonymiseDeletedCustomers({
    olderThanDays: days,
    dryRun: args.dryRun,
    limit: 100000,
  });
  console.log(
    `${args.dryRun ? "[dry-run] " : ""}deleted > ${days} days ago and not anonymised: ${result.candidates}`
  );
  if (args.dryRun) {
    result.ids.slice(0, 50).forEach((id) => console.log(`  ${id}`));
    console.log("Dry run only — re-run with --apply to anonymise.");
  } else {
    console.log(`anonymised: ${result.anonymised}`);
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
