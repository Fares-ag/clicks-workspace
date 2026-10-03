#!/usr/bin/env node
/**
 * Invalidate all admin JWTs for one email (logout every device/session).
 *
 * Usage:
 *   FORCE_ADMIN_LOGOUT_ALLOW_PRODUCTION=true node scripts/force-admin-logout.js callcenterroom1@gmail.com
 */
const path = require("path");
const dns = require("dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

require("../clicks-admin-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-admin-api/.env"),
});

const mongoose = require("mongoose");
const Admin = require("../clicks-shared/models/Admin");
const { escapeRegex } = require("../clicks-shared/utils/escapeRegex");

async function main() {
  const email = (process.argv[2] || process.env.TARGET_ADMIN_EMAIL || "").trim();
  if (!email) {
    throw new Error("Usage: node scripts/force-admin-logout.js <email>");
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI missing (clicks-admin-api/.env)");

  const hostMatch = uri.match(/^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)/i);
  const hosts = hostMatch ? hostMatch[1].split(",") : [];
  const isLocal =
    hosts.length > 0 &&
    hosts.every((h) => /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(h.trim()));
  if (!isLocal && process.env.FORCE_ADMIN_LOGOUT_ALLOW_PRODUCTION !== "true") {
    throw new Error(
      "Refusing non-local Mongo without FORCE_ADMIN_LOGOUT_ALLOW_PRODUCTION=true"
    );
  }

  await mongoose.connect(uri);

  const exact = new RegExp(`^${escapeRegex(email)}$`, "i");
  const admin = await Admin.findOne({ email: exact }).select(
    "email firstName lastName role isActive authTokenVersion"
  );
  if (!admin) {
    throw new Error(`No admin found for ${email}`);
  }

  const before = Number(admin.authTokenVersion) || 0;
  admin.authTokenVersion = before + 1;
  admin.fcm_token = null;
  await admin.save();

  console.log(
    JSON.stringify(
      {
        ok: true,
        email: admin.email,
        name: `${admin.firstName} ${admin.lastName}`,
        role: admin.role,
        isActive: admin.isActive,
        authTokenVersion: { before, after: admin.authTokenVersion },
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
