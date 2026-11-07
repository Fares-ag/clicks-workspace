#!/usr/bin/env node
/**
 * Lower-case + trim customer emails and resolve case-duplicates (QW 2/8,
 * scenario 8: "Ali@x.com" and "ali@x.com" were two accounts).
 *
 *   node scripts/dedupe-customer-emails.js --dry-run
 *       report every group of rows whose emails differ only by case/space,
 *       and every row that is not yet lower-case.
 *   node scripts/dedupe-customer-emails.js --apply
 *       lower-case every non-colliding email. Colliding groups are FLAGGED:
 *       the primary (most jobs, then most recent) gets the clean address and
 *       the others get "<local>+dup-<client_id>@<domain>" so the unique index
 *       holds; support follows up from the printed list.
 *   node scripts/dedupe-customer-emails.js --apply --merge
 *       colliding groups are MERGED into the primary instead (jobs,
 *       vehicles, memberships... re-pointed; see scripts/lib/customerMerge.js).
 *       Only use when the rows are known to be the same person.
 */
const { parseArgs, connect } = require("./lib/scriptArgs");

function clean(email) {
  return String(email || "").trim().toLowerCase();
}

function flaggedAddress(email, row) {
  const [local, domain = "invalid"] = clean(email).split("@");
  const tag = String(row.client_id || row._id).replace(/[^A-Za-z0-9-]/g, "");
  return `${local}+dup-${tag}@${domain}`;
}

async function main() {
  const args = parseArgs();
  const merge = args.has("--merge");
  const mongoose = await connect();
  const { Customer } = require("../clicks-shared/models");
  const { choosePrimary, mergeCustomers } = require("./lib/customerMerge");

  const rows = await Customer.find({ anonymized_at: null })
    .select("_id client_id email phone_number status deleted_at updatedAt")
    .lean();

  const groups = new Map();
  for (const row of rows) {
    const key = clean(row.email);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const collisions = [...groups.entries()].filter(([, list]) => list.length > 1);
  const notClean = rows.filter((r) => r.email && clean(r.email) !== r.email);

  console.log(`${args.dryRun ? "[dry-run] " : ""}customers scanned: ${rows.length}`);
  console.log(`case-duplicate groups: ${collisions.length}`);
  console.log(`emails not lower-case/trimmed: ${notClean.length}`);

  const colliding = new Set();
  for (const [email, list] of collisions) {
    const ordered = await choosePrimary(list);
    const [primary, ...dups] = ordered;
    list.forEach((r) => colliding.add(String(r._id)));
    console.log(`\n${email}: ${list.length} rows (${merge ? "merge" : "flag"})`);
    for (const r of ordered) {
      console.log(
        `  ${r === primary ? "KEEP " : merge ? "MERGE" : "FLAG "} ${r._id} ${r.client_id || ""} "${r.email}" phone=${r.phone_number} jobs=${r._jobs}`
      );
    }
    if (!args.apply) continue;
    if (merge) {
      await mergeCustomers(primary, dups, { apply: true });
    } else {
      for (const dup of dups) {
        const next = flaggedAddress(email, dup);
        await Customer.updateOne({ _id: dup._id }, { $set: { email: next } });
        console.log(`    ${dup._id} → ${next}`);
      }
    }
    await Customer.updateOne({ _id: primary._id }, { $set: { email } });
  }

  if (args.apply) {
    let fixed = 0;
    for (const row of notClean) {
      if (colliding.has(String(row._id))) continue;
      try {
        await Customer.updateOne({ _id: row._id }, { $set: { email: clean(row.email) } });
        fixed += 1;
      } catch (err) {
        console.error(`  could not lower-case ${row._id}: ${err.message}`);
      }
    }
    console.log(`\nlower-cased: ${fixed}`);
  } else {
    console.log("\nDry run only — re-run with --apply (or --apply --merge).");
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
