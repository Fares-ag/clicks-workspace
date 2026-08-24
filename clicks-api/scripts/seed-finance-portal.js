/**
 * Seed Finance Portal demo user.
 *
 * Usage:
 *   node scripts/seed-finance-portal.js
 */
const path = require("path");
require("../clicks-admin-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-admin-api/.env"),
});
const mongoose = require("mongoose");
const bcrypt = require("../clicks-admin-api/node_modules/bcryptjs");
const FinanceUser = require("../clicks-shared/models/FinanceUser");

async function upsert(Model, query, data) {
  const existing = await Model.findOne(query);
  if (existing) {
    Object.assign(existing, data);
    await existing.save();
    return existing;
  }
  return Model.create({ ...query, ...data });
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI missing");
  await mongoose.connect(uri);
  console.log("Connected");

  await upsert(
    FinanceUser,
    { email: "finance@clicks.local" },
    {
      name: "Finance Operator",
      phone: "+97444440002",
      password: bcrypt.hashSync("Finance123!", 10),
      role: "operator",
      isActive: true,
    }
  );

  console.log("✓ Finance user: finance@clicks.local / Finance123!");
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
