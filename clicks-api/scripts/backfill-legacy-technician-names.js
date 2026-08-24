/**
 * Backfill legacyTechnicianName on already-imported historical jobs from Excel.
 *
 * Usage:
 *   node scripts/backfill-legacy-technician-names.js "C:/Users/TS/Downloads/Clicks Raw exported_data.xlsx"
 */
const path = require("path");
const fs = require("fs");

require("../clicks-admin-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-admin-api/.env"),
});

const mongoose = require("mongoose");
const xlsx = require("../clicks-admin-api/node_modules/xlsx");
const { Job } = require("../clicks-shared/models");

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node scripts/backfill-legacy-technician-names.js "<path-to.xlsx>"');
    process.exit(1);
  }

  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    console.error(`File not found: ${resolved}`);
    process.exit(1);
  }

  const workbook = xlsx.readFile(resolved, { cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });

  const byLegacyId = new Map();
  for (const row of rows) {
    const id = row.id != null && row.id !== "" ? Number(row.id) : null;
    const techName = row.techname != null ? String(row.techname).trim() : "";
    if (Number.isFinite(id) && techName) {
      byLegacyId.set(id, techName);
    }
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Loaded ${byLegacyId.size} legacy technician names from Excel`);

  let updated = 0;
  let missing = 0;
  const legacyIds = [...byLegacyId.keys()];
  const batchSize = 500;

  for (let i = 0; i < legacyIds.length; i += batchSize) {
    const batch = legacyIds.slice(i, i + batchSize);
    const ops = batch.map((legacyId) => ({
      updateOne: {
        filter: { legacy_id: legacyId },
        update: { $set: { legacyTechnicianName: byLegacyId.get(legacyId) } },
      },
    }));
    const result = await Job.bulkWrite(ops, { ordered: false });
    updated += result.modifiedCount || 0;
    missing += batch.length - (result.matchedCount || 0);
  }

  console.log(`Backfill complete: ${updated} jobs updated`);
  if (missing > 0) console.log(`Note: ${missing} Excel rows had no matching job in DB`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
