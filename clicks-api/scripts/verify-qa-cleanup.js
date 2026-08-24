#!/usr/bin/env node
/**
 * Verify production DB has no remaining QA/demo records.
 */
const path = require("path");
const dns = require("dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

require("../clicks-admin-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-admin-api/.env"),
});

const mongoose = require("mongoose");
const Job = require("../clicks-shared/models/Job");
const Partner = require("../clicks-shared/models/Partner");
const Business = require("../clicks-shared/models/Business");
const FinanceUser = require("../clicks-shared/models/FinanceUser");
const Admin = require("../clicks-shared/models/Admin");
const Lead = require("../clicks-shared/models/Lead");

const QA_JOB_OR = [
  { loadtest: true },
  { clientName: /^QA / },
  { clientName: "Walk-in Guest" },
  { completion_notes: /^QA cleanup complete$/i },
];

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI missing");

  const hostMatch = uri.match(/^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)/i);
  const hosts = hostMatch ? hostMatch[1].split(",") : [];
  const isLocal =
    hosts.length > 0 &&
    hosts.every((h) => /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(h.trim()));
  if (!isLocal && process.env.CLEANUP_ALLOW_PRODUCTION !== "true") {
    throw new Error("Set CLEANUP_ALLOW_PRODUCTION=true for non-local DB");
  }

  await mongoose.connect(uri);

  const checks = {
    qaJobs: await Job.countDocuments({ $or: QA_JOB_OR }),
    demoPartner: await Partner.countDocuments({ email: "partner@clicks.local" }),
    demoBusiness: await Business.countDocuments({ name: "Al-Mana Showroom" }),
    demoFinanceUser: await FinanceUser.countDocuments({ email: "finance@clicks.local" }),
    qaFinanceUsers: await FinanceUser.countDocuments({ email: /^qa\.finance\./i }),
    qaAdmins: await Admin.countDocuments({ email: /^qa-/i }),
    qaLeads: await Lead.countDocuments({ clientName: /^QA/i }),
    totalJobs: await Job.countDocuments({}),
    protectedAdminPresent: await Admin.countDocuments({ email: "admin@clicks.local" }),
  };

  console.log("Production QA cleanup verification:\n");
  for (const [key, value] of Object.entries(checks)) {
    const ok =
      key === "totalJobs" || key === "protectedAdminPresent"
        ? value > 0
        : value === 0;
    console.log(`  ${ok ? "OK" : "FAIL"}  ${key}: ${value}`);
  }

  const failed =
    checks.qaJobs +
    checks.demoPartner +
    checks.demoBusiness +
    checks.demoFinanceUser +
    checks.qaFinanceUsers +
    checks.qaAdmins +
    checks.qaLeads;

  if (failed > 0 || !checks.protectedAdminPresent) {
    process.exitCode = 1;
    console.log("\nVerification FAILED — QA data may still be present.");
  } else {
    console.log("\nVerification PASSED — production DB is clean.");
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
