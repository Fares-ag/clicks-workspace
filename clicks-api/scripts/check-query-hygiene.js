#!/usr/bin/env node
/**
 * Perf lint for hot-path controllers only (jobs/leads search + list pagination).
 * Exit 1 listing offenders in scoped files.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const HOT_FILES = [
  "clicks-admin-api/src/controllers/jobController.js",
  "clicks-admin-api/src/controllers/leadController.js",
  "clicks-customer-tech-api/src/controllers/jobController.js",
  "clicks-customer-tech-api/src/controllers/technicianController.js",
];

const offenders = [];

function checkFile(relPath) {
  const full = path.join(ROOT, relPath);
  if (!fs.existsSync(full)) return;
  const text = fs.readFileSync(full, "utf8");

  text.split("\n").forEach((line, i) => {
    if (!line.includes("$regex")) return;
    const hasAnchor = /\^\s*["'`]|new RegExp\(\s*[`'"]\^/.test(line);
    if (!hasAnchor && /\$regex/.test(line)) {
      offenders.push(`${relPath}:${i + 1} unanchored $regex`);
    }
  });

  if (relPath.includes("jobController") || relPath.includes("leadController") || relPath.includes("technicianController")) {
    const fnBlocks = text.match(/async function get(Jobs|Leads|CustomerJobs)[\s\S]*?^}/gm) || [];
    for (const block of fnBlocks) {
      if (block.includes(".find(") && !block.includes(".limit(")) {
        offenders.push(`${relPath} getJobs/getLeads missing .limit()`);
      }
    }
  }
}

for (const rel of HOT_FILES) checkFile(rel);

if (offenders.length) {
  console.error("Query hygiene failures:\n" + [...new Set(offenders)].join("\n"));
  process.exit(1);
}

console.log("Query hygiene OK (hot paths)");
