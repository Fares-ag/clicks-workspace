#!/usr/bin/env node
/**
 * Normalize technician expertise from legacy strings to the new RSA catalog.
 *
 * Usage (dry-run — default):
 *   node scripts/normalize-technician-expertise.js
 *
 * Apply writes:
 *   node scripts/normalize-technician-expertise.js --apply
 *
 * Requires MONGODB_URI in clicks-admin-api/.env or environment.
 */
const path = require("path");

require("../clicks-admin-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-admin-api/.env"),
});

const mongoose = require("mongoose");
const { Technician } = require("../clicks-shared/models");
const { JOB_TYPES } = require("../clicks-shared/constants/jobTypes");

/** Legacy stored values → canonical JOB_TYPES entry. Unmapped values are kept. */
const LEGACY_EXPERTISE_TO_CANONICAL = {
  "Jump start": "Jump Start",
  "Flat tire": "Flat Tire",
  Lockout: "Lock Out",
  "Fuel delivery": "Fuel Delivery",
  "Battery replacement": "Battery Replacement",
  "Accident assistance": "Accident",
  Gearbox: "Gear Box",
  keyless_car_opening: "Lock Out",
  tire_change: "Tire Change",
};

function normalizeExpertiseList(expertise) {
  if (!Array.isArray(expertise) || expertise.length === 0) return expertise;

  const out = [];
  const seen = new Set();

  for (const raw of expertise) {
    const value = String(raw || "").trim();
    if (!value) continue;

    let next = value;
    if (!JOB_TYPES.includes(value) && LEGACY_EXPERTISE_TO_CANONICAL[value]) {
      next = LEGACY_EXPERTISE_TO_CANONICAL[value];
    }

    if (!seen.has(next)) {
      seen.add(next);
      out.push(next);
    }
  }

  return out;
}

function expertiseChanged(before, after) {
  if (!Array.isArray(before) && !Array.isArray(after)) return false;
  if (!Array.isArray(before) || !Array.isArray(after)) return true;
  if (before.length !== after.length) return true;
  return before.some((v, i) => v !== after[i]);
}

async function main() {
  const apply = process.argv.includes("--apply");
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is required");
    process.exit(1);
  }

  await mongoose.connect(uri);

  const technicians = await Technician.find({ expertise: { $exists: true, $ne: [] } })
    .select("firstName lastName email expertise")
    .lean();

  let wouldUpdate = 0;
  let updated = 0;

  for (const tech of technicians) {
    const before = tech.expertise || [];
    const after = normalizeExpertiseList(before);
    if (!expertiseChanged(before, after)) continue;

    wouldUpdate += 1;
    console.log(
      `[${apply ? "apply" : "dry-run"}] ${tech.email}: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`
    );

    if (apply) {
      await Technician.updateOne(
        { _id: tech._id },
        { $set: { expertise: after } }
      );
      updated += 1;
    }
  }

  console.log(
    apply
      ? `Done. Updated ${updated} technician(s).`
      : `Dry-run complete. ${wouldUpdate} technician(s) would be updated. Re-run with --apply to write.`
  );

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
