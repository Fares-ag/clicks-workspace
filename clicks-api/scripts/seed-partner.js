/**
 * Seed a demo Partner for the Partner mobile app.
 * Safe to re-run (upserts by email).
 *
 * Usage: node scripts/seed-partner.js
 * (loads clicks-admin-api/.env for MONGODB_URI)
 */
const path = require("path");
require("../clicks-admin-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-admin-api/.env"),
});
const mongoose = require("mongoose");
const bcrypt = require("../clicks-admin-api/node_modules/bcryptjs");
const Partner = require("../clicks-shared/models/Partner");
const {
  ensureGoogleSourceWithSubSource,
} = require("../clicks-shared/services/partnerService");

const EMAIL = "partner@clicks.local";
const PASSWORD = "Partner123!";
const NAME = "Demo Partner";
const PHONE = "+97455550001";

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI missing in clicks-admin-api/.env");
  await mongoose.connect(uri);
  console.log("Connected");

  const investmentAmount = 10000;
  const profitPerPeriod = 4000;
  const currentPeriod = 1;
  const started = new Date();
  const currentPeriodCap = investmentAmount + currentPeriod * profitPerPeriod;

  let partner = await Partner.findOne({ email: EMAIL });
  const payload = {
    name: NAME,
    phone: PHONE,
    email: EMAIL,
    password: bcrypt.hashSync(PASSWORD, 10),
    isActive: true,
    investmentAmount,
    profitPerPeriod,
    currentPeriodCap,
    periodMonths: 2,
    currentPeriod,
    periodStartedAt: started,
    periodEndsAt: Partner.computePeriodEnd(started, 2),
    status: "active",
  };

  if (partner) {
    Object.assign(partner, payload);
    // Keep accruedTotal if partner already exists
    await partner.save();
    console.log("Updated partner:", NAME);
  } else {
    partner = await Partner.create({
      ...payload,
      accruedTotal: 0,
    });
    console.log("Created partner:", NAME);
  }

  await ensureGoogleSourceWithSubSource(NAME);

  console.log("");
  console.log("Partner app login");
  console.log("  Email:   ", EMAIL);
  console.log("  Phone:   ", PHONE);
  console.log("  Password:", PASSWORD);
  console.log("  Cap:     ", currentPeriodCap, "QAR");
  console.log("  Google sub-source name:", NAME);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
