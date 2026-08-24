#!/usr/bin/env node
/**
 * clicks-shared is copied into Docker images but npm install runs only in each
 * service directory. Any npm package required from clicks-shared must appear in
 * BOTH clicks-admin-api and clicks-customer-tech-api dependencies.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SHARED_DIR = path.join(ROOT, "clicks-shared");
const SERVICES = [
  { name: "clicks-admin-api", pkg: path.join(ROOT, "clicks-admin-api", "package.json") },
  { name: "clicks-customer-tech-api", pkg: path.join(ROOT, "clicks-customer-tech-api", "package.json") },
];

const BUILTIN = new Set([
  "assert",
  "assert/strict",
  "buffer",
  "child_process",
  "cluster",
  "crypto",
  "dgram",
  "dns",
  "events",
  "fs",
  "http",
  "https",
  "module",
  "net",
  "node:assert",
  "node:assert/strict",
  "node:buffer",
  "node:crypto",
  "node:fs",
  "node:path",
  "node:test",
  "node:util",
  "os",
  "path",
  "process",
  "stream",
  "timers",
  "tls",
  "url",
  "util",
  "worker_threads",
  "zlib",
]);

/** mongoose is a peerDependency of clicks-shared; services install it directly. */
const PEER = new Set(["mongoose"]);

function walkJsFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkJsFiles(full, out);
      continue;
    }
    if (entry.name.endsWith(".js") && !entry.name.endsWith(".test.js")) {
      out.push(full);
    }
  }
  return out;
}

function collectSharedRequires() {
  const required = new Map();
  const pattern = /require\(\s*["']([^"']+)["']\s*\)/g;

  for (const file of walkJsFiles(SHARED_DIR)) {
    const text = fs.readFileSync(file, "utf8");
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1];
      if (name.startsWith(".") || name.startsWith("clicks-shared/")) continue;
      if (BUILTIN.has(name) || PEER.has(name)) continue;
      const root = name.startsWith("@") ? name.split("/").slice(0, 2).join("/") : name.split("/")[0];
      if (!required.has(root)) {
        required.set(root, path.relative(ROOT, file));
      }
    }
  }

  return required;
}

function loadDeps(pkgPath) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  return new Set(Object.keys(pkg.dependencies || {}));
}

const sharedRequires = collectSharedRequires();
const offenders = [];

for (const [dep, sourceFile] of sharedRequires.entries()) {
  for (const service of SERVICES) {
    const deps = loadDeps(service.pkg);
    if (!deps.has(dep)) {
      offenders.push(
        `${service.name} missing "${dep}" (required by clicks-shared/${sourceFile})`
      );
    }
  }
}

if (offenders.length) {
  console.error("Shared dependency check failed:\n");
  for (const line of offenders) console.error(`  - ${line}`);
  console.error(
    "\nAdd each missing package to BOTH service package.json files, then npm install in each service directory."
  );
  process.exit(1);
}

console.log(
  `Shared dependency check passed (${sharedRequires.size} external package(s) present in both APIs).`
);
