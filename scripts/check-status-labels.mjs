#!/usr/bin/env node
/**
 * Ensures jobStatusLabels.js stays byte-identical across the three portal copies.
 * Usage: node scripts/check-status-labels.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const COPIES = [
  "clicks-interface/src/utils/jobStatusLabels.js",
  "clicks-business-web/src/utils/jobStatusLabels.js",
  "clicks-finance-web/src/utils/jobStatusLabels.js",
];

function normalizeNewlines(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function readCopy(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) {
    console.error(`jobStatusLabels.js sync check failed: missing file ${relPath}`);
    process.exit(1);
  }
  return normalizeNewlines(fs.readFileSync(abs, "utf8"));
}

const referencePath = COPIES[0];
const reference = readCopy(referencePath);
const divergent = [];

for (let i = 1; i < COPIES.length; i += 1) {
  const relPath = COPIES[i];
  if (readCopy(relPath) !== reference) {
    divergent.push(relPath);
  }
}

if (divergent.length > 0) {
  console.error("jobStatusLabels.js copies are out of sync.");
  console.error(`Reference copy: ${referencePath}`);
  console.error("Divergent copy/copies:");
  for (const relPath of divergent) {
    console.error(`  - ${relPath}`);
  }
  console.error(
    "Edit all three files to match, then re-run: node scripts/check-status-labels.mjs"
  );
  process.exit(1);
}

console.log(
  "jobStatusLabels.js is in sync across clicks-interface, clicks-business-web, and clicks-finance-web."
);
