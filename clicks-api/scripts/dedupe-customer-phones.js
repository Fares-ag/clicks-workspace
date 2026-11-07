#!/usr/bin/env node
/**
 * Customer phone dedupe + E.164 normalisation (WS-F item 1, scenario 7).
 *
 * Legacy rows store the same number as "55512345", "97455512345" and
 * "+97455512345", so login matched whichever row Mongo returned first. This
 * script groups customers by normalised E.164 number and:
 *   - reports every group with more than one row (dry run, the default);
 *   - with --apply: merges each group into one primary (most jobs, then
 *     most recently updated; see scripts/lib/customerMerge.js) and rewrites
 *     every remaining phone_number to E.164.
 *   - with --apply --flag-only: does NOT merge; prints the groups and only
 *     normalises rows that are not part of a collision.
 *
 * After --apply, the existing unique index on Customer.phone_number guards the
 * normalised number (build it with scripts/sync-indexes.js --apply).
 *
 *   node scripts/dedupe-customer-phones.js --dry-run
 *   node scripts/dedupe-customer-phones.js --apply
 */
const { parseArgs, connect } = require("./lib/scriptArgs");

async function main() {
  const args = parseArgs();
  const flagOnly = args.has("--flag-only");
  const mongoose = await connect();
  const { Customer } = require("../clicks-shared/models");
  const { normalizePhoneE164, digitsOnly } = require("../clicks-shared/utils/phone");
  const { choosePrimary, mergeCustomers } = require("./lib/customerMerge");

  const rows = await Customer.find({ anonymized_at: null, phone_number: { $not: /^(deleted|merged):/ } })
    .select("_id client_id phone_number email status deleted_at updatedAt")
    .lean();

  const groups = new Map();
  for (const row of rows) {
    const key = normalizePhoneE164(row.phone_number);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const collisions = [...groups.entries()].filter(([, list]) => list.length > 1);
  const needsNormalising = rows.filter((r) => normalizePhoneE164(r.phone_number) !== r.phone_number);

  console.log(`${args.dryRun ? "[dry-run] " : ""}customers scanned: ${rows.length}`);
  console.log(`collision groups: ${collisions.length}`);
  console.log(`rows not yet E.164: ${needsNormalising.length}`);

  const collidingIds = new Set();
  for (const [phone, list] of collisions) {
    const ordered = await choosePrimary(list);
    const [primary, ...dups] = ordered;
    list.forEach((r) => collidingIds.add(String(r._id)));
    console.log(`\n${phone}: ${list.length} rows`);
    for (const r of ordered) {
      console.log(
        `  ${r === primary ? "KEEP " : "MERGE"} ${r._id} ${r.client_id || ""} stored="${r.phone_number}" jobs=${r._jobs} status=${r.status}${r.deleted_at ? " deleted" : ""}`
      );
    }
    if (!flagOnly) {
      const report = await mergeCustomers(primary, dups, { apply: args.apply });
      for (const m of report.merged) {
        console.log(`    refs moved from ${m.id}: ${JSON.stringify(m.refs)}`);
      }
    }
  }

  let normalised = 0;
  if (args.apply) {
    for (const row of needsNormalising) {
      if (flagOnly && collidingIds.has(String(row._id))) continue;
      const fresh = await Customer.findById(row._id).select("phone_number status").lean();
      if (!fresh || /^(deleted|merged):/.test(fresh.phone_number)) continue;
      const e164 = normalizePhoneE164(fresh.phone_number);
      try {
        await Customer.updateOne(
          { _id: row._id },
          { $set: { phone_number: e164, search_phone: digitsOnly(e164) } }
        );
        normalised += 1;
      } catch (err) {
        console.error(`  could not normalise ${row._id} (${fresh.phone_number}): ${err.message}`);
      }
    }
    console.log(`\nnormalised to E.164: ${normalised}`);
  } else {
    console.log("\nDry run only — re-run with --apply to merge and normalise.");
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
