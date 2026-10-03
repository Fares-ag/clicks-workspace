#!/usr/bin/env node
/**
 * Restore admin + finance login accounts removed by cleanup-qa-data.js.
 * Does NOT recreate QA jobs, leads, or other test data.
 *
 * Usage:
 *   node scripts/restore-qa-accounts.js
 *   RESTORE_ALLOW_PRODUCTION=true node scripts/restore-qa-accounts.js
 */
const path = require("path");
const dns = require("dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

require("../clicks-admin-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-admin-api/.env"),
});

const mongoose = require("mongoose");
const bcrypt = require("../clicks-admin-api/node_modules/bcryptjs");
const Admin = require("../clicks-shared/models/Admin");
const FinanceUser = require("../clicks-shared/models/FinanceUser");

const ACCOUNTS = {
  financeUsers: [
    {
      email: "finance@clicks.local",
      name: "Finance Operator",
      phone: "+97444440002",
      password: "Finance123!",
      role: "operator",
    },
  ],
  admins: [
    {
      email: "qa-job-dispatcher@clicks.local",
      firstName: "QA",
      lastName: "JobDispatcher",
      role: "Job Dispatcher",
      phone: "+97455550200",
      password: "Dispatch123!",
    },
    {
      email: "qa-dispatcher@clicks.local",
      firstName: "QA",
      lastName: "Dispatcher",
      role: "Call Center Agent",
      phone: "+97455550199",
      password: "Dispatch123!",
    },
  ],
};

async function upsertFinanceUser(spec) {
  const existing = await FinanceUser.findOne({ email: spec.email });
  const passwordHash = bcrypt.hashSync(spec.password, 10);
  if (existing) {
    existing.name = spec.name;
    existing.phone = spec.phone;
    existing.password = passwordHash;
    existing.role = spec.role;
    existing.isActive = true;
    await existing.save();
    return { email: spec.email, action: "updated" };
  }
  await FinanceUser.create({
    email: spec.email,
    name: spec.name,
    phone: spec.phone,
    password: passwordHash,
    role: spec.role,
    isActive: true,
  });
  return { email: spec.email, action: "created" };
}

async function upsertAdmin(spec) {
  const existing = await Admin.findOne({ email: spec.email });
  const passwordHash = bcrypt.hashSync(spec.password, 10);
  if (existing) {
    existing.firstName = spec.firstName;
    existing.lastName = spec.lastName;
    existing.role = spec.role;
    existing.phone = spec.phone;
    existing.password = passwordHash;
    existing.isActive = true;
    await existing.save();
    return { email: spec.email, action: "updated" };
  }
  await Admin.create({
    firstName: spec.firstName,
    lastName: spec.lastName,
    role: spec.role,
    email: spec.email,
    phone: spec.phone,
    password: passwordHash,
    isActive: true,
  });
  return { email: spec.email, action: "created" };
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI missing (clicks-admin-api/.env)");

  const hostMatch = uri.match(/^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)/i);
  const hosts = hostMatch ? hostMatch[1].split(",") : [];
  const isLocal =
    hosts.length > 0 &&
    hosts.every((h) => /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(h.trim()));
  if (!isLocal && process.env.RESTORE_ALLOW_PRODUCTION !== "true") {
    throw new Error(
      "Refusing to restore on a non-local database without RESTORE_ALLOW_PRODUCTION=true"
    );
  }

  await mongoose.connect(uri);
  console.log("Restoring QA admin + finance accounts...\n");

  for (const spec of ACCOUNTS.financeUsers) {
    const result = await upsertFinanceUser(spec);
    console.log(`  FinanceUser ${result.action}: ${result.email}`);
  }
  for (const spec of ACCOUNTS.admins) {
    const result = await upsertAdmin(spec);
    console.log(`  Admin ${result.action}: ${result.email} (${spec.role})`);
  }

  console.log("\nDone. Credentials:");
  console.log("  finance@clicks.local / Finance123!");
  console.log("  qa-job-dispatcher@clicks.local / Dispatch123!");
  console.log("  qa-dispatcher@clicks.local / Dispatch123!");

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
