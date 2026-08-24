#!/usr/bin/env node
/**
 * Guardrails for the dual-service Railway layout: both APIs deploy from
 * clicks-api/ but must use separate config-as-code files and Dockerfiles.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const checks = [
  {
    ok: () => !fs.existsSync(path.join(ROOT, "railway.toml")),
    error:
      "clicks-api/railway.toml must not exist — both services share this directory and would build the same image.",
  },
  {
    ok: () => fs.existsSync(path.join(ROOT, "railway.admin.toml")),
    error: "railway.admin.toml is missing.",
  },
  {
    ok: () => fs.existsSync(path.join(ROOT, "railway.tech.toml")),
    error: "railway.tech.toml is missing.",
  },
  {
    ok: () => fs.existsSync(path.join(ROOT, "Dockerfile.admin-api")),
    error: "Dockerfile.admin-api is missing.",
  },
  {
    ok: () => fs.existsSync(path.join(ROOT, "Dockerfile.tech-api")),
    error: "Dockerfile.tech-api is missing.",
  },
];

function readToml(name) {
  return fs.readFileSync(path.join(ROOT, name), "utf8");
}

function assertDockerfileConfig(file) {
  const text = readToml(file);
  if (!/builder\s*=\s*["']DOCKERFILE["']/i.test(text)) {
    throw new Error(`${file} must set builder = "DOCKERFILE" (Railpack will fail on the workspace package.json).`);
  }
  const dockerMatch = text.match(/dockerfilePath\s*=\s*["']([^"']+)["']/i);
  if (!dockerMatch) {
    throw new Error(`${file} must set dockerfilePath.`);
  }
  const dockerfile = dockerMatch[1];
  if (!fs.existsSync(path.join(ROOT, dockerfile))) {
    throw new Error(`${file} points at missing ${dockerfile}.`);
  }
  if (!/\/api\/health/.test(text)) {
    throw new Error(`${file} should set healthcheckPath = "/api/health".`);
  }
}

const errors = checks.filter((c) => !c.ok()).map((c) => c.error);

try {
  assertDockerfileConfig("railway.admin.toml");
  assertDockerfileConfig("railway.tech.toml");
} catch (err) {
  errors.push(err.message);
}

if (errors.length) {
  console.error("Railway deploy config check failed:\n");
  for (const line of errors) console.error(`  - ${line}`);
  console.error(
    "\nOne-time Railway dashboard settings (cannot be set via CLI):\n" +
      "  Project melodious-achievement · source root: clicks-api\n" +
      "  clicks-admin-api → Config-as-code: railway.admin.toml\n" +
      "  clicks-tech-api  → Config-as-code: railway.tech.toml"
  );
  process.exit(1);
}

console.log("Railway deploy config check passed.");
