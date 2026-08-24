/**
 * Seed VehicleMake / VehicleModel from Hatla2ee Qatar catalog.
 * Safe to re-run (upserts by makeName / makeId+modelName).
 *
 * Usage:
 *   $env:MONGODB_URI="mongodb://127.0.0.1:27017/clicks"
 *   node scripts/seed-hatla2ee-vehicle-catalog.js
 */
const fs = require("fs");
const path = require("path");
require("../clicks-admin-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-admin-api/.env"),
});
const mongoose = require("mongoose");
const VehicleMake = require("../clicks-shared/models/VehicleMake");
const VehicleModel = require("../clicks-shared/models/VehicleModel");

const DISPLAY_NAMES = {
  "alpha-romeo": "Alfa Romeo",
  "volks-wagen": "Volkswagen",
  "ssang-yong": "SsangYong",
  "li-auto": "Li Auto",
  lynkco: "Lynk & Co",
  "moris-garage": "MG",
  gmc: "GMC",
  bmw: "BMW",
  byd: "BYD",
  ds: "DS",
  gac: "GAC",
  jac: "JAC",
  jmc: "JMC",
  kgm: "KGM",
  kyc: "KYC",
  lml: "LML",
  "m-hero": "M-Hero",
  dfm: "DFM",
  dfsk: "DFSK",
  vgv: "VGV",
  zna: "ZNA",
  tvs: "TVS",
  elwahab: "El Wahab",
  "golden-dragon": "Golden Dragon",
  "great-wall": "Great Wall",
  "harley-davidson": "Harley-Davidson",
  "hashim-bus": "Hashim Bus",
  "honda-wuyang": "Honda Wuyang",
  "land-rover": "Land Rover",
  "aston-martin": "Aston Martin",
};

function titleFromSlug(slug) {
  if (DISPLAY_NAMES[slug]) return DISPLAY_NAMES[slug];
  return slug
    .split("-")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

async function ensureCompoundIndex() {
  const coll = mongoose.connection.collection("vehiclemodels");
  try {
    await coll.dropIndex("modelName_1");
    console.log("Dropped legacy unique index modelName_1");
  } catch (err) {
    if (err?.codeName !== "IndexNotFound" && err?.code !== 27) {
      console.warn("dropIndex modelName_1:", err.message);
    }
  }
  await VehicleModel.syncIndexes();
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI missing");

  const jsonPath = path.join(
    __dirname,
    "../data/hatla2ee-qatar-makes-models.json"
  );
  const catalog = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

  await mongoose.connect(uri);
  console.log("Connected");
  await ensureCompoundIndex();

  let makeCount = 0;
  let modelCount = 0;

  const slugs = Object.keys(catalog).sort((a, b) =>
    titleFromSlug(a).localeCompare(titleFromSlug(b))
  );

  for (const slug of slugs) {
    const makeName = titleFromSlug(slug);
    const models = Array.isArray(catalog[slug]) ? catalog[slug] : [];

    let make = await VehicleMake.findOne({ makeName });
    if (!make) {
      make = await VehicleMake.create({ makeName, isActive: true });
      makeCount++;
    } else if (!make.isActive) {
      make.isActive = true;
      await make.save();
    }

    for (const modelName of models) {
      const name = String(modelName || "").trim();
      if (!name) continue;
      const existing = await VehicleModel.findOne({
        makeId: make._id,
        modelName: name,
      });
      if (!existing) {
        await VehicleModel.create({
          makeId: make._id,
          modelName: name,
          isActive: true,
        });
        modelCount++;
      } else if (!existing.isActive) {
        existing.isActive = true;
        await existing.save();
      }
    }
  }

  const totalMakes = await VehicleMake.countDocuments({ isActive: true });
  const totalModels = await VehicleModel.countDocuments({ isActive: true });
  console.log(
    `Done. Created ${makeCount} makes, ${modelCount} models. Active totals: ${totalMakes} makes, ${totalModels} models.`
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
