/**
 * One-time / bulk import of historical jobs from the legacy Excel export.
 * Connects directly to MongoDB (no HTTP) — preferred for ~17k rows.
 *
 * Usage:
 *   node scripts/import-historical-jobs.js "C:/Users/TS/Downloads/Clicks Raw exported_data.xlsx"
 *   node scripts/import-historical-jobs.js ./data.xlsx --dry-run
 */
const path = require("path");
const fs = require("fs");

require("../clicks-admin-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-admin-api/.env"),
});

const mongoose = require("mongoose");
const xlsx = require("../clicks-admin-api/node_modules/xlsx");
const { Job, Source, Technician } = require("../clicks-shared/models");
const {
  mapHistoricalRow,
  importHistoricalJobs,
} = require("../clicks-shared/utils/historicalJobImport");

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const dryRun = process.argv.includes("--dry-run");
  const filePath = args[0];

  if (!filePath) {
    console.error(
      'Usage: node scripts/import-historical-jobs.js "<path-to.xlsx>" [--dry-run]'
    );
    process.exit(1);
  }

  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    console.error(`File not found: ${resolved}`);
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI missing (check clicks-admin-api/.env)");
    process.exit(1);
  }

  console.log(`Reading ${resolved}...`);
  const workbook = xlsx.readFile(resolved, { cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    console.error("Excel file has no sheets");
    process.exit(1);
  }
  const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });
  console.log(`Parsed ${rows.length} rows from sheet "${sheetName}"`);

  if (dryRun) {
    let ok = 0;
    let bad = 0;
    const sample = [];
    for (let i = 0; i < rows.length; i++) {
      const { doc, error, techName } = mapHistoricalRow(rows[i]);
      if (error || !doc) {
        bad += 1;
        if (sample.length < 5) {
          sample.push({ row: i + 2, legacy_id: rows[i]?.id, error });
        }
      } else {
        ok += 1;
        if (sample.length < 5 && ok <= 3) {
          sample.push({
            row: i + 2,
            legacy_id: doc.legacy_id,
            clientName: doc.clientName,
            job_status: doc.job_status,
            jobType: doc.jobType,
            price: doc.price,
            techName,
          });
        }
      }
    }
    console.log(`Dry run: ${ok} mappable, ${bad} invalid`);
    console.log("Sample:", JSON.stringify(sample, null, 2));
    process.exit(0);
  }

  await mongoose.connect(uri);
  console.log("Connected to MongoDB");

  try {
    const result = await importHistoricalJobs({
      Job,
      Source,
      Technician,
      rows,
    });
    console.log("Import finished:");
    console.log(`  imported: ${result.imported}`);
    console.log(`  skipped:  ${result.skipped}`);
    console.log(`  errors:   ${result.errors.length}`);
    if (result.errors.length) {
      console.log("First errors:", JSON.stringify(result.errors.slice(0, 20), null, 2));
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
