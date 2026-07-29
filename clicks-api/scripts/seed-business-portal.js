/**
 * Seed Business Portal source + demo business/user (local or production).
 * Safe to re-run.
 *
 * Usage:
 *   node scripts/seed-business-portal.js
 *   (loads clicks-admin-api/.env for MONGODB_URI)
 */
const path = require("path");
require("../clicks-admin-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-admin-api/.env"),
});
const mongoose = require("../clicks-shared/node_modules/mongoose");
const bcrypt = require("../clicks-admin-api/node_modules/bcryptjs");
const { Business, BusinessUser, Source } = require("../clicks-shared/models");

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

  const source = await upsert(
    Source,
    { mainSourceName: "Business Portal" },
    { isActive: true, subSources: [{ name: "Mobile App" }] }
  );

  const business = await upsert(
    Business,
    { name: "Al-Mana Showroom" },
    {
      phone: "+97444440000",
      email: "business@clicks.local",
      address: "Salwa Road, Doha",
      cutType: "revenue",
      cutPercent: 10,
      defaultSource: source._id,
      isActive: true,
    }
  );

  await upsert(
    BusinessUser,
    { email: "business@clicks.local" },
    {
      business_id: business._id,
      name: "Showroom Staff",
      phone: "+97444440001",
      password: bcrypt.hashSync("Business123!", 10),
      role: "owner",
      isActive: true,
    }
  );

  console.log("✓ Source: Business Portal");
  console.log("✓ Business: Al-Mana Showroom");
  console.log("✓ Login: business@clicks.local / Business123!");
  console.log("  (phone +97444440001 also works)");
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
