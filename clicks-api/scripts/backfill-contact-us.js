#!/usr/bin/env node
/**
 * Backfill Contact Us rows (WS-H item 3, scenario 100):
 *   - `category` code from the stored en/ar label in `issue`;
 *   - a `ticket_number` for rows created before numbering existed (oldest first).
 *
 *   node scripts/backfill-contact-us.js --dry-run
 *   node scripts/backfill-contact-us.js --apply
 */
const { parseArgs, connect } = require("./lib/scriptArgs");

async function main() {
  const args = parseArgs();
  const mongoose = await connect();
  const ContactUs = require("../clicks-shared/models/ContactUs");
  const { categoryCodeFor } = require("../clicks-shared/constants/contactUsCategories");

  // Raw collection read: Mongoose would apply the "other" default to rows that
  // have no category, hiding exactly the rows we need to fix.
  const rows = await ContactUs.collection
    .find({}, { projection: { _id: 1, issue: 1, category: 1, ticket_number: 1, createdAt: 1 } })
    .sort({ createdAt: 1 })
    .toArray();

  const tally = {};
  let categorised = 0;
  let numbered = 0;
  for (const row of rows) {
    const set = {};
    if (!row.category) {
      set.category = categoryCodeFor(row.issue);
      tally[set.category] = (tally[set.category] || 0) + 1;
    }
    if (!row.ticket_number && args.apply) {
      set.ticket_number = await ContactUs.nextTicketNumber();
    }
    if (!row.ticket_number) numbered += 1;
    if (set.category) categorised += 1;
    if (args.apply && Object.keys(set).length) {
      await ContactUs.collection.updateOne({ _id: row._id }, { $set: set });
    }
  }

  console.log(`${args.dryRun ? "[dry-run] " : ""}contact-us rows: ${rows.length}`);
  console.log(`rows without category: ${categorised} ${JSON.stringify(tally)}`);
  console.log(`rows without ticket number: ${numbered}`);
  if (args.dryRun) console.log("Dry run only — re-run with --apply.");
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
