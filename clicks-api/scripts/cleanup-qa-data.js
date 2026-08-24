#!/usr/bin/env node
/**
 * Remove QA / demo / loadtest data from MongoDB.
 *
 * Keeps production seed accounts by default:
 *   admin@clicks.local, omar.tech@clicks.local, sara.tech@clicks.local, customer@clicks.local
 *
 * Usage:
 *   node scripts/cleanup-qa-data.js --dry-run
 *   node scripts/cleanup-qa-data.js --confirm
 *   CLEANUP_ALLOW_PRODUCTION=true node scripts/cleanup-qa-data.js --confirm
 */
const path = require("path");
const dns = require("dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

require("../clicks-admin-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-admin-api/.env"),
});

const mongoose = require("mongoose");

const Admin = require("../clicks-shared/models/Admin");
const Partner = require("../clicks-shared/models/Partner");
const PartnerEarning = require("../clicks-shared/models/PartnerEarning");
const PartnerWithdrawal = require("../clicks-shared/models/PartnerWithdrawal");
const Job = require("../clicks-shared/models/Job");
const JobArchive = require("../clicks-shared/models/JobArchive");
const Lead = require("../clicks-shared/models/Lead");
const SOSRequest = require("../clicks-shared/models/SOSRequest");
const ServiceRequest = require("../clicks-shared/models/ServiceRequest");
const Source = require("../clicks-shared/models/Source");
const Business = require("../clicks-shared/models/Business");
const BusinessUser = require("../clicks-shared/models/BusinessUser");
const FinanceUser = require("../clicks-shared/models/FinanceUser");
const FinanceAuditLog = require("../clicks-shared/models/FinanceAuditLog");
const Receipt = require("../clicks-shared/models/Receipt");
const TechnicianEarningEntry = require("../clicks-shared/models/TechnicianEarningEntry");
const AdminAuditLog = require("../clicks-shared/models/AdminAuditLog");

const PROTECTED_EMAILS = new Set([
  "admin@clicks.local",
  "omar.tech@clicks.local",
  "sara.tech@clicks.local",
  "customer@clicks.local",
]);

const QA_CLIENT_NAMES = new Set([
  "QA Push Test",
  "QA Partner Accrual",
  "QA Add Job Customer",
  "QA Test Customer",
  "QA Intensive Customer",
  "QA Lead Customer",
  "QA Lost Lead",
  "QA Portal Customer",
  "QA Direct Notify",
  "QA Background Alert",
  "QA Tech Loc",
  "QA Business Loc",
  "Showroom Walk-in",
  "Walk-in Guest",
  "Walk-in Test",
  "QA wrong type",
  "QA wrong source",
  "QA wrong subSource",
  "QA inactive partner",
]);

const QA_JOB_FILTER = {
  $or: [
    { loadtest: true },
    { clientName: /^Load Client \d/i },
    { issue: /^Load test job$/i },
    { clientName: /^QA / },
    { issue: /^QA / },
    {
      issue:
        /\bQA\b.*\b(push|test|intensive|partner|cleanup|smoke|location|alert|accrual|converted|gate|repair|add-job|background|finance|should fail|preflight|tire check|notification)\b/i,
    },
    { job_reference: /^QA-/i },
    { cancel_reason: /^QA /i },
    {
      cancel_reason:
        /^(QA preflight cleanup|QA intensive cleanup|QA push test cleanup|QA customer intensive cleanup|QA scheduled cleanup|QA vehicle-bound cleanup|QA final cleanup|QA intensive reject|QA intensive cancel|QA background alert cleanup)$/i,
    },
    { clientName: { $in: [...QA_CLIENT_NAMES] } },
    { clientName: /^QA Loc / },
    { clientName: /^QA Partner / },
    { clientName: /^QA Intensive / },
    { clientName: /^QA Business / },
    { clientName: /^QA Tech / },
    { completion_notes: /^QA cleanup complete$/i },
    { completion_notes: /^QA preflight cleanup$/i },
    { completion_notes: /^QA intensive cleanup$/i },
    { completion_notes: /^QA push test cleanup$/i },
    { completion_notes: /^QA completion$/i },
    { completion_notes: /^QA gate job complete$/i },
    { completion_notes: /^QA should fail/i },
    { completion_notes: /^QA test notes$/i },
    { completion_notes: /^QA finance smoke test$/i },
  ],
};

const QA_LEAD_FILTER = {
  $or: [
    { clientName: /^QA/i },
    { inquiry: /\bQA\b/i },
    { notes: /\bQA\b/i },
  ],
};

const QA_SOS_FILTER = {
  $or: [{ issue: /\bQA\b/i }, { cancel_reason: /\bQA\b/i }],
};

const QA_SERVICE_REQUEST_FILTER = {
  $or: [{ issue: /\bQA\b/i }, { description: /\bQA\b/i }],
};

function isProtectedEmail(email) {
  return PROTECTED_EMAILS.has(String(email || "").toLowerCase());
}

function qaAdminFilter() {
  return {
    email: {
      $regex: /^(qa-|qa\.)/i,
      $nin: [...PROTECTED_EMAILS],
    },
  };
}

function qaPartnerFilter() {
  return {
    $or: [
      { email: /^qa-partner-/i },
      { email: /^qa\.finance\./i },
      { email: "partner@clicks.local" },
      { name: /^QA Partner /i },
      { name: "Demo Partner" },
    ],
  };
}

function qaFinanceUserFilter() {
  return {
    $or: [{ email: "finance@clicks.local" }, { email: /^qa\.finance\./i }, { name: /^QA Finance /i }],
  };
}

function qaBusinessFilter() {
  return {
    $or: [{ email: "business@clicks.local" }, { name: "Al-Mana Showroom" }],
  };
}

async function countModel(Model, filter, label) {
  const n = await Model.countDocuments(filter);
  return { label, model: Model.modelName, count: n, filter };
}

async function deleteModel(Model, filter, label, dryRun, summary) {
  const count = await Model.countDocuments(filter);
  if (count === 0) return;
  summary.push({ label, model: Model.modelName, count });
  if (!dryRun) {
    await Model.deleteMany(filter);
  }
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
  console.log(dryRun ? "DRY RUN — no deletes\n" : "LIVE DELETE — removing QA data\n");

  const summary = [];
  const qaPartners = await Partner.find(qaPartnerFilter()).select("_id email name").lean();
  const qaPartnerIds = qaPartners.map((p) => p._id);

  const qaJobFilter = QA_JOB_FILTER;

  const qaJobs = await Job.find(qaJobFilter).select("_id clientName issue completion_notes").lean();
  const qaJobIds = qaJobs.map((j) => j._id);

  if (qaJobs.length) {
    console.log(`QA jobs matched: ${qaJobs.length}`);
    for (const j of qaJobs.slice(0, 15)) {
      console.log(`  - ${j._id} ${j.clientName} / ${String(j.issue).slice(0, 60)}`);
    }
    if (qaJobs.length > 15) console.log(`  … and ${qaJobs.length - 15} more`);
    console.log("");
  }

  if (qaJobIds.length) {
    await deleteModel(Receipt, { job_id: { $in: qaJobIds } }, "receipts for QA jobs", dryRun, summary);
    await deleteModel(
      TechnicianEarningEntry,
      { job_id: { $in: qaJobIds } },
      "technician earning entries for QA jobs",
      dryRun,
      summary
    );
    await deleteModel(
      PartnerEarning,
      { job_id: { $in: qaJobIds } },
      "partner earnings for QA jobs",
      dryRun,
      summary
    );
    await deleteModel(
      FinanceAuditLog,
      { job_id: { $in: qaJobIds } },
      "finance audit logs for QA jobs",
      dryRun,
      summary
    );
    await deleteModel(JobArchive, { _id: { $in: qaJobIds } }, "job archives (QA ids)", dryRun, summary);
    await deleteModel(Job, { _id: { $in: qaJobIds } }, "QA jobs", dryRun, summary);
  }

  await deleteModel(Lead, QA_LEAD_FILTER, "QA leads", dryRun, summary);
  await deleteModel(SOSRequest, QA_SOS_FILTER, "QA SOS requests", dryRun, summary);
  await deleteModel(ServiceRequest, QA_SERVICE_REQUEST_FILTER, "QA service requests", dryRun, summary);

  if (qaPartnerIds.length) {
    await deleteModel(
      PartnerWithdrawal,
      { partner_id: { $in: qaPartnerIds } },
      "partner withdrawals (QA partners)",
      dryRun,
      summary
    );
    await deleteModel(
      PartnerEarning,
      { partner_id: { $in: qaPartnerIds } },
      "partner earnings (QA partners)",
      dryRun,
      summary
    );
    await deleteModel(Partner, { _id: { $in: qaPartnerIds } }, "QA / demo partners", dryRun, summary);
  }

  await deleteModel(BusinessUser, { email: "business@clicks.local" }, "demo business users", dryRun, summary);
  await deleteModel(Business, qaBusinessFilter(), "demo businesses", dryRun, summary);
  await deleteModel(FinanceUser, qaFinanceUserFilter(), "QA / demo finance users", dryRun, summary);
  await deleteModel(Admin, qaAdminFilter(), "QA admin accounts", dryRun, summary);

  const loadtestSource = await Source.findOne({ mainSourceName: "Loadtest Source" }).lean();
  if (loadtestSource) {
    const stillUsed = await Job.countDocuments({ source: loadtestSource._id });
    if (stillUsed === 0) {
      await deleteModel(Source, { _id: loadtestSource._id }, "Loadtest Source", dryRun, summary);
    } else {
      console.warn(`Loadtest Source kept — ${stillUsed} jobs still reference it`);
    }
  }

  await deleteModel(Source, { mainSourceName: "QA Deny" }, "QA Deny source", dryRun, summary);

  // QA finance audit notes without job_id
  await deleteModel(
    FinanceAuditLog,
    { notes: /\bQA\b/i },
    "finance audit logs (QA notes)",
    dryRun,
    summary
  );

  console.log("\nSummary:");
  if (!summary.length) {
    console.log("  Nothing matched — database already clean.");
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
