/**
 * Backfill vehicleMake, vehicleModel, vehicleYear, licensePlate on historical jobs.
 *
 * Usage:
 *   node scripts/backfill-legacy-vehicle-fields.js "C:/Users/TS/Downloads/Clicks Raw exported_data.xlsx"
 */
const path = require("path");
const fs = require("fs");

require("../clicks-admin-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-admin-api/.env"),
});

const mongoose = require("mongoose");
const xlsx = require("../clicks-admin-api/node_modules/xlsx");
const { Job } = require("../clicks-shared/models");
const { parseLegacyVehicle } = require("../clicks-shared/utils/historicalJobImport");

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node scripts/backfill-legacy-vehicle-fields.js "<path-to.xlsx>"');
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
    if (!Number.isFinite(id)) continue;
    const { vehicleMake, vehicleModel, vehicleYear } = parseLegacyVehicle(row.cmodel);
    const licensePlate = row.cplateno != null ? String(row.cplateno).trim() : "";
    byLegacyId.set(id, { vehicleMake, vehicleModel, vehicleYear, licensePlate });
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Prepared vehicle data for ${byLegacyId.size} legacy jobs`);

  let updated = 0;
  const legacyIds = [...byLegacyId.keys()];
  const batchSize = 500;

  for (let i = 0; i < legacyIds.length; i += batchSize) {
    const batch = legacyIds.slice(i, i + batchSize);
    const ops = batch.map((legacyId) => {
      const v = byLegacyId.get(legacyId);
      return {
        updateOne: {
          filter: { legacy_id: legacyId },
          update: {
            $set: {
              vehicleMake: v.vehicleMake,
              vehicleModel: v.vehicleModel,
              vehicleYear: v.vehicleYear,
              licensePlate: v.licensePlate,
            },
          },
        },
      };
    });
    const result = await Job.bulkWrite(ops, { ordered: false });
    updated += result.modifiedCount || 0;
  }

  const withMake = await Job.countDocuments({
    legacy_id: { $exists: true, $ne: null },
    vehicleMake: { $ne: "" },
  });
  console.log(`Backfill complete: ${updated} jobs updated, ${withMake} now have vehicleMake set`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
