/**
 * Backfill locationCoordinates on jobs from their location string.
 *
 * Usage:
 *   node scripts/backfill-job-coordinates.js
 */
const path = require("path");

require("../clicks-admin-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-admin-api/.env"),
});

const mongoose = require("mongoose");
const { Job } = require("../clicks-shared/models");
const {
  parseJobLocationToGeoPoint,
} = require("../clicks-shared/utils/parseJobLocation");

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB");

  const cursor = Job.find({
    $or: [
      { locationCoordinates: { $exists: false } },
      { "locationCoordinates.coordinates": { $exists: false } },
      { "locationCoordinates.coordinates": { $size: 0 } },
    ],
  })
    .select("_id location")
    .lean()
    .cursor();

  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  const batch = [];
  const BATCH_SIZE = 500;

  async function flush() {
    if (batch.length === 0) return;
    const ops = batch.splice(0, batch.length);
    const result = await Job.bulkWrite(ops, { ordered: false });
    updated += result.modifiedCount || 0;
  }

  for await (const job of cursor) {
    scanned += 1;
    const geo = parseJobLocationToGeoPoint(job.location);
    if (!geo) {
      skipped += 1;
      continue;
    }
    batch.push({
      updateOne: {
        filter: { _id: job._id },
        update: { $set: { locationCoordinates: geo } },
      },
    });
    if (batch.length >= BATCH_SIZE) {
      await flush();
      process.stdout.write(`\rScanned ${scanned}, updated ${updated}, skipped ${skipped}`);
    }
  }
  await flush();

  const withCoords = await Job.countDocuments({
    "locationCoordinates.coordinates.0": { $exists: true },
  });
  const total = await Job.countDocuments({});

  console.log(
    `\nBackfill complete: scanned=${scanned}, updated=${updated}, skipped=${skipped}`
  );
  console.log(`Jobs with coordinates: ${withCoords} / ${total}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
