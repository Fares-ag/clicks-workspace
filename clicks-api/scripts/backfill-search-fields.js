/**
 * Backfill search_phone and search_name on Job and Lead documents.
 *
 * Usage:
 *   node scripts/backfill-search-fields.js
 */
const path = require("path");

require("../clicks-admin-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-admin-api/.env"),
});

const mongoose = require("mongoose");
const { Job, Lead } = require("../clicks-shared/models");
const {
  computeJobSearchFields,
  computeLeadSearchFields,
} = require("../clicks-shared/utils/searchFields");

const BATCH = 1000;

async function backfillModel(Model, computeFn, label) {
  const cursor = Model.find({})
    .select("_id clientName clientMobileNumber search_phone search_name")
    .lean()
    .cursor();

  let batch = [];
  let updated = 0;
  let scanned = 0;

  for await (const doc of cursor) {
    scanned += 1;
    const fields = computeFn(doc);
    if (doc.search_phone === fields.search_phone && doc.search_name === fields.search_name) {
      continue;
    }
    batch.push({
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: fields },
      },
    });
    if (batch.length >= BATCH) {
      const result = await Model.bulkWrite(batch, { ordered: false });
      updated += result.modifiedCount;
      console.log(`[${label}] scanned=${scanned} updated=${updated}`);
      batch = [];
    }
  }

  if (batch.length) {
    const result = await Model.bulkWrite(batch, { ordered: false });
    updated += result.modifiedCount;
  }
  console.log(`[${label}] done scanned=${scanned} updated=${updated}`);
  return { scanned, updated };
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is required");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected — backfilling search fields in batches of", BATCH);

  await backfillModel(Job, computeJobSearchFields, "Job");
  await backfillModel(Lead, computeLeadSearchFields, "Lead");

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
