/**
 * Shared bootstrap for the maintenance scripts in this folder.
 *
 * Every data-changing script is DRY-RUN BY DEFAULT: it only writes with
 * --apply. `--dry-run` is accepted explicitly too (and wins over --apply), so
 * release checklists can spell out the dry-run step.
 */
const path = require("path");

function loadEnv() {
  try {
    require("../../clicks-admin-api/node_modules/dotenv").config({
      path: path.join(__dirname, "../../clicks-admin-api/.env"),
    });
  } catch {
    /* env may come from the shell */
  }
}

function parseArgs(argv = process.argv.slice(2)) {
  const has = (flag) => argv.includes(flag);
  const value = (name, fallback) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
  };
  const dryRun = has("--dry-run") || !has("--apply");
  return { dryRun, apply: !dryRun, has, value };
}

async function connect() {
  loadEnv();
  // The instance the shared models are bound to (see clicks-shared/mongoose.js).
  const mongoose = require("../../clicks-shared/mongoose");
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI required");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);
  return mongoose;
}

module.exports = { loadEnv, parseArgs, connect };
