/**
 * Nightly SOS <-> Job consistency report (WS-A item 3, scenario 44).
 *
 * Read-only. Flags:
 *   - SOS "accepted" with no job_id, or whose job does not exist
 *   - SOS still pending/in_call while a job points at it
 *   - SOS cancelled while its job is live (a truck may be driving)
 *   - SOS whose job is cancelled but the SOS is still "accepted"
 *   - more than one job pointing at the same SOS
 *   - customers with more than one live SOS (blocks the unique index build)
 *
 * Usage: node scripts/check-sos-job-consistency.js [--days=30] [--json]
 * Exit code 2 when anything is flagged, so a cron can alert on it.
 */
const path = require("path");
require("../clicks-admin-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-customer-tech-api/.env"),
});
const mongoose = require("../clicks-shared/mongoose");
const { Job, SOSRequest } = require("../clicks-shared/models");

const LIVE_JOB = ["pending", "assigned", "accepted", "en_route", "arrived", "in_progress", "on_hold"];
const daysArg = process.argv.find((a) => a.startsWith("--days="));
const DAYS = daysArg ? Number(daysArg.split("=")[1]) || 30 : 30;
const AS_JSON = process.argv.includes("--json");

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(process.env.MONGODB_URI);
  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);
  const issues = [];

  const soses = await SOSRequest.find({ createdAt: { $gte: since } })
    .select("_id status job_id customer_id createdAt")
    .lean();
  const jobIds = soses.map((s) => s.job_id).filter(Boolean);
  const jobs = await Job.find({ _id: { $in: jobIds } }).select("_id job_status sos_request_id").lean();
  const jobById = new Map(jobs.map((j) => [String(j._id), j]));

  for (const sos of soses) {
    const job = sos.job_id ? jobById.get(String(sos.job_id)) : null;
    if (sos.status === "accepted" && !sos.job_id) {
      issues.push({ kind: "accepted_without_job", sos: String(sos._id) });
    } else if (sos.job_id && !job) {
      issues.push({ kind: "job_missing", sos: String(sos._id), job: String(sos.job_id) });
    } else if (job) {
      if (["pending", "in_call"].includes(sos.status)) {
        issues.push({ kind: "open_sos_with_job", sos: String(sos._id), job: String(job._id), job_status: job.job_status });
      }
      if (sos.status === "cancelled" && LIVE_JOB.includes(job.job_status)) {
        issues.push({ kind: "cancelled_sos_live_job", sos: String(sos._id), job: String(job._id), job_status: job.job_status });
      }
      if (sos.status === "accepted" && job.job_status === "cancelled") {
        issues.push({ kind: "accepted_sos_cancelled_job", sos: String(sos._id), job: String(job._id) });
      }
    }
  }

  const multi = await Job.aggregate([
    { $match: { sos_request_id: { $ne: null }, createdAt: { $gte: since } } },
    { $group: { _id: "$sos_request_id", n: { $sum: 1 }, jobs: { $push: "$_id" } } },
    { $match: { n: { $gt: 1 } } },
  ]);
  for (const m of multi) {
    issues.push({ kind: "multiple_jobs_for_sos", sos: String(m._id), jobs: m.jobs.map(String) });
  }

  const dupLive = await SOSRequest.aggregate([
    { $match: { status: { $in: ["pending", "in_call"] } } },
    { $group: { _id: "$customer_id", n: { $sum: 1 }, soses: { $push: "$_id" } } },
    { $match: { n: { $gt: 1 } } },
  ]);
  for (const d of dupLive) {
    issues.push({ kind: "multiple_live_sos_for_customer", customer: String(d._id), soses: d.soses.map(String) });
  }

  if (AS_JSON) {
    console.log(JSON.stringify({ days: DAYS, scanned: soses.length, issues }, null, 2));
  } else {
    console.log(`[sos-consistency] scanned ${soses.length} SOS from the last ${DAYS} days`);
    const byKind = {};
    for (const i of issues) byKind[i.kind] = (byKind[i.kind] || 0) + 1;
    console.log("[sos-consistency] issues by kind:", JSON.stringify(byKind));
    for (const i of issues.slice(0, 50)) console.log("  ", JSON.stringify(i));
  }
  await mongoose.disconnect();
  if (issues.length) process.exit(2);
}

main().catch(async (err) => {
  console.error("[sos-consistency] failed:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
