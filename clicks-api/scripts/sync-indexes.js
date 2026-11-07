#!/usr/bin/env node
/**
 * Build MongoDB indexes for every shared model (WS-I item 3).
 *
 * Production runs with autoIndex:false (clicks-shared/mongoose.js), so a new
 * index declared in a schema — the Notification TTL, the unique ticket
 * number, the one-active-SOS partial index another workstream adds — does
 * not exist until something builds it. Run this as a release step.
 *
 *   node scripts/sync-indexes.js --dry-run     # list what would be created/dropped
 *   node scripts/sync-indexes.js --apply       # createIndexes() — additive only
 *   node scripts/sync-indexes.js --apply --drop  # syncIndexes(): ALSO drops indexes
 *                                                # not declared in the schema
 *   --model=Customer                           # limit to one model
 *
 * Every *.js file in clicks-shared/models is loaded, so models added by other
 * workstreams are picked up without editing this script.
 */
const fs = require("fs");
const path = require("path");
const { parseArgs, connect } = require("./lib/scriptArgs");

const MODELS_DIR = path.join(__dirname, "../clicks-shared/models");

function loadAllModels(mongoose) {
  for (const file of fs.readdirSync(MODELS_DIR).sort()) {
    if (!file.endsWith(".js") || file === "index.js" || file.endsWith(".test.js")) continue;
    require(path.join(MODELS_DIR, file));
  }
  return Object.keys(mongoose.models)
    .sort()
    .map((name) => mongoose.models[name]);
}

function indexLabel(spec) {
  if (!spec) return "?";
  if (Array.isArray(spec)) {
    const [fields, options = {}] = spec;
    const opts = ["unique", "sparse", "expireAfterSeconds", "partialFilterExpression", "name"]
      .filter((k) => options[k] !== undefined)
      .map((k) => `${k}=${JSON.stringify(options[k])}`);
    return `${JSON.stringify(fields)}${opts.length ? ` {${opts.join(", ")}}` : ""}`;
  }
  return typeof spec === "string" ? spec : JSON.stringify(spec);
}

async function main() {
  const args = parseArgs();
  const drop = args.has("--drop");
  const only = args.value("model", "");
  const mongoose = await connect();
  const models = loadAllModels(mongoose).filter((m) => !only || m.modelName === only);

  console.log(
    `${args.dryRun ? "[dry-run] " : ""}sync-indexes: ${models.length} model(s)` +
      (args.apply ? (drop ? " — syncIndexes (create + drop)" : " — createIndexes (additive)") : "")
  );

  let failures = 0;
  for (const Model of models) {
    try {
      // Collection may not exist yet; diffIndexes copes with that.
      const diff = await Model.diffIndexes();
      const toCreate = diff.toCreate || [];
      const toDrop = diff.toDrop || [];
      if (!toCreate.length && !toDrop.length) {
        console.log(`  ${Model.modelName}: up to date`);
        continue;
      }
      for (const spec of toCreate) console.log(`  ${Model.modelName}: + ${indexLabel(spec)}`);
      for (const name of toDrop) {
        console.log(`  ${Model.modelName}: - ${indexLabel(name)}${drop ? "" : " (kept; pass --drop)"}`);
      }
      if (args.apply) {
        if (drop) await Model.syncIndexes();
        else if (toCreate.length) await Model.createIndexes();
        console.log(`  ${Model.modelName}: applied`);
      }
    } catch (err) {
      failures += 1;
      // A unique index over existing duplicates fails here — e.g. run
      // scripts/dedupe-customer-phones.js before the Customer index.
      console.error(`  ${Model.modelName}: FAILED — ${err.message}`);
    }
  }

  await mongoose.disconnect();
  if (failures) {
    console.error(`${failures} model(s) failed`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
