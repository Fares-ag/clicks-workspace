/**
 * Move old audited completed/cancelled jobs to JobArchive (cold collection).
 * Dry-run by default — pass --confirm to execute.
 *
 * Archived jobs are excluded from dashboards by design; getJobById resolves them read-only.
 *
 * Usage:
 *   node scripts/archive-old-jobs.js
 *   node scripts/archive-old-jobs.js --confirm
 */
const path = require("path");

require("../clicks-admin-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-admin-api/.env"),
});

const mongoose = require("mongoose");
const { Job } = require("../clicks-shared/models");
const JobArchive = require("../clicks-shared/models/JobArchive");

const ARCHIVE_MONTHS = Number(process.env.ARCHIVE_MONTHS || 18);
const BATCH = 500;
const confirm = process.argv.includes("--confirm");

function cutoffDate() {
  const d = new Date();
  d.setMonth(d.getMonth() - ARCHIVE_MONTHS);
  return d;
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI required");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);

  const cutoff = cutoffDate();
  const filter = {
    job_status: { $in: ["completed", "cancelled"] },
    finance_status: "audited",
    $or: [{ completed_at: { $lt: cutoff } }, { createdAt: { $lt: cutoff } }],
  };

  const candidates = await Job.countDocuments(filter);
  console.log(`Archive candidates (audited, older than ${ARCHIVE_MONTHS}mo): ${candidates}`);

  if (!confirm) {
    console.log("Dry-run only — re-run with --confirm to move jobs");
    await mongoose.disconnect();
    return;
  }

  let moved = 0;
  while (true) {
    const batch = await Job.find(filter).limit(BATCH).lean();
    if (!batch.length) break;

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await JobArchive.insertMany(batch, { session });
        await Job.deleteMany({ _id: { $in: batch.map((j) => j._id) } }, { session });
      });
      moved += batch.length;
      console.log(`Moved ${moved}/${candidates}`);
    } finally {
      session.endSession();
    }
  }

  console.log(`Done. Archived ${moved} jobs.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
