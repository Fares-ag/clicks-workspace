/**
 * Backfill ServiceRequest terminal states (WS-G item 2, scenario 54).
 *
 * Before the terminal-state fix, the only status ever written to a
 * ServiceRequest was "assigned", so rows whose job long since completed or was
 * cancelled still count as an active session and trap the customer on the
 * waiting screen. This moves each such row to "completed" / "cancelled" to
 * match its job.
 *
 * Usage:
 *   node scripts/backfill-service-request-status.js --dry-run   (default)
 *   node scripts/backfill-service-request-status.js --apply
 *
 * Env: MONGODB_URI (read from clicks-customer-tech-api/.env when present).
 */
const path = require("path");
require("../clicks-admin-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-customer-tech-api/.env"),
});
const mongoose = require("../clicks-shared/mongoose");
const { Job, ServiceRequest } = require("../clicks-shared/models");

const APPLY = process.argv.includes("--apply");
const BATCH = 500;

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not set");
  }
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`[backfill-sr] mode=${APPLY ? "APPLY" : "DRY-RUN"}`);

  const counts = { scanned: 0, completed: 0, cancelled: 0, untouched: 0 };
  const sample = [];
  let lastId = null;

  for (;;) {
    const filter = {
      status: { $in: ["pending", "assigned"] },
      job_id: { $ne: null },
      ...(lastId ? { _id: { $gt: lastId } } : {}),
    };
    const rows = await ServiceRequest.find(filter)
      .select("_id job_id status")
      .sort({ _id: 1 })
      .limit(BATCH)
      .lean();
    if (!rows.length) break;
    lastId = rows[rows.length - 1]._id;
    counts.scanned += rows.length;

    const jobs = await Job.find({
      _id: { $in: rows.map((r) => r.job_id) },
      job_status: { $in: ["completed", "cancelled"] },
    })
      .select("_id job_status completed_at cancelled_at")
      .lean();
    const byId = new Map(jobs.map((j) => [String(j._id), j]));

    for (const row of rows) {
      const job = byId.get(String(row.job_id));
      if (!job) {
        counts.untouched += 1;
        continue;
      }
      const status = job.job_status;
      counts[status] += 1;
      if (sample.length < 20) {
        sample.push({ service_request: String(row._id), job: String(job._id), from: row.status, to: status });
      }
      if (APPLY) {
        const set = { status };
        if (status === "completed") set.completed_at = job.completed_at || new Date();
        if (status === "cancelled") set.cancelled_at = job.cancelled_at || new Date();
        await ServiceRequest.updateOne(
          { _id: row._id, status: { $in: ["pending", "assigned"] } },
          { $set: set }
        );
      }
    }
  }

  console.log("[backfill-sr] sample:", JSON.stringify(sample, null, 2));
  console.log("[backfill-sr] counts:", JSON.stringify(counts));
  if (!APPLY) console.log("[backfill-sr] dry run only — re-run with --apply to write.");
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("[backfill-sr] failed:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
