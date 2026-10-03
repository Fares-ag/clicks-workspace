#!/usr/bin/env node
/**
 * Remove all jobs assigned to or created by the demo technicians Omar & Sara.
 *
 * Targets omar.tech@clicks.local (+97411111111) and sara.tech@clicks.local (+97422222222).
 * Cascades: receipts, technician earning entries, partner earnings, finance audit logs, archives.
 *
 * Usage:
 *   node scripts/cleanup-demo-tech-jobs.js --dry-run
 *   node scripts/cleanup-demo-tech-jobs.js --confirm
 *   CLEANUP_ALLOW_PRODUCTION=true node scripts/cleanup-demo-tech-jobs.js --confirm
 */
const path = require("path");
const dns = require("dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

require("../clicks-admin-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-admin-api/.env"),
});

const mongoose = require("mongoose");
const Technician = require("../clicks-shared/models/Technician");
const Job = require("../clicks-shared/models/Job");
const JobArchive = require("../clicks-shared/models/JobArchive");
const Receipt = require("../clicks-shared/models/Receipt");
const TechnicianEarningEntry = require("../clicks-shared/models/TechnicianEarningEntry");
const PartnerEarning = require("../clicks-shared/models/PartnerEarning");
const FinanceAuditLog = require("../clicks-shared/models/FinanceAuditLog");

const DEMO_TECH_EMAILS = ["omar.tech@clicks.local", "sara.tech@clicks.local"];

function jobFilterForTechIds(techIds) {
  return {
    $or: [
      { assignedTechnician: { $in: techIds } },
      { created_by_technician: { $in: techIds } },
      { "hold_request.requested_by": { $in: techIds } },
      { legacyTechnicianName: /^(Omar Al-?Thani|Sara Hassan)$/i },
      { createdByTechnicianName: /^(Omar Al-?Thani|Sara Hassan|Omar|Sara)\b/i },
    ],
  };
}

async function deleteModel(Model, filter, label, dryRun, summary) {
  const count = await Model.countDocuments(filter);
  if (count === 0) return;
  summary.push({ label, model: Model.modelName, count });
  if (!dryRun) await Model.deleteMany(filter);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run") || !process.argv.includes("--confirm");
  if (!process.argv.includes("--dry-run") && !process.argv.includes("--confirm")) {
    console.error("Pass --dry-run to preview or --confirm to delete.");
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI missing (clicks-admin-api/.env)");

  const hostMatch = uri.match(/^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)/i);
  const hosts = hostMatch ? hostMatch[1].split(",") : [];
  const isLocal =
    hosts.length > 0 &&
    hosts.every((h) => /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(h.trim()));
  if (!isLocal && process.env.CLEANUP_ALLOW_PRODUCTION !== "true") {
    throw new Error(
      "Refusing to clean a non-local database without CLEANUP_ALLOW_PRODUCTION=true"
    );
  }

  await mongoose.connect(uri);

  const techs = await Technician.find({ email: { $in: DEMO_TECH_EMAILS } })
    .select("_id firstName lastName email phone")
    .lean();
  if (!techs.length) {
    throw new Error(`No demo technicians found for ${DEMO_TECH_EMAILS.join(", ")}`);
  }

  const techIds = techs.map((t) => t._id);
  const filter = jobFilterForTechIds(techIds);

  console.log(dryRun ? "DRY RUN — no deletes\n" : "LIVE DELETE — removing demo tech jobs\n");
  console.log("Technicians:");
  for (const t of techs) {
    console.log(`  - ${t.firstName} ${t.lastName} (${t.email}, ${t.phone})`);
  }
  console.log("");

  const jobs = await Job.find(filter)
    .select("_id clientName job_status assignedTechnician created_by_technician legacyTechnicianName")
    .lean();
  const archives = await JobArchive.find(filter)
    .select("_id clientName job_status")
    .lean();
  const jobIds = [...new Set([...jobs.map((j) => j._id), ...archives.map((j) => j._id)])];

  const byStatus = {};
  for (const j of jobs) {
    byStatus[j.job_status] = (byStatus[j.job_status] || 0) + 1;
  }

  console.log(`Active jobs matched: ${jobs.length}`);
  if (Object.keys(byStatus).length) {
    console.log(`  By status: ${JSON.stringify(byStatus)}`);
  }
  for (const j of jobs.slice(0, 10)) {
    console.log(`  - ${j._id} [${j.job_status}] ${j.clientName}`);
  }
  if (jobs.length > 10) console.log(`  … and ${jobs.length - 10} more`);
  console.log(`Archived jobs matched: ${archives.length}\n`);

  const summary = [];

  if (jobIds.length) {
    await deleteModel(Receipt, { job_id: { $in: jobIds } }, "receipts", dryRun, summary);
    await deleteModel(
      TechnicianEarningEntry,
      { job_id: { $in: jobIds } },
      "technician earning entries",
      dryRun,
      summary
    );
    await deleteModel(
      PartnerEarning,
      { job_id: { $in: jobIds } },
      "partner earnings",
      dryRun,
      summary
    );
    await deleteModel(
      FinanceAuditLog,
      { job_id: { $in: jobIds } },
      "finance audit logs",
      dryRun,
      summary
    );
    await deleteModel(JobArchive, filter, "archived demo tech jobs", dryRun, summary);
    await deleteModel(Job, filter, "demo tech jobs", dryRun, summary);
  }

  console.log("Summary:");
  if (!summary.length) {
    console.log("  Nothing matched — no demo tech jobs found.");
  } else {
    for (const row of summary) {
      console.log(`  ${row.model}: ${row.count}`);
    }
    const total = summary.reduce((n, r) => n + r.count, 0);
    console.log(`\nTotal documents ${dryRun ? "that would be removed" : "removed"}: ${total}`);
  }

  if (dryRun) {
    console.log("\nRe-run with --confirm to delete (and CLEANUP_ALLOW_PRODUCTION=true on production).");
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
