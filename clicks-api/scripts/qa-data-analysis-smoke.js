#!/usr/bin/env node
/**
 * Smoke the Data Analysis admin API (full-admin only).
 *
 * Usage:
 *   node scripts/qa-data-analysis-smoke.js
 *
 * Env:
 *   ADMIN_URL, ADMIN_EMAIL, ADMIN_PASSWORD
 */
const path = require("path");
const fs = require("fs");

const envPath = path.join(__dirname, "../clicks-admin-api/.env");
if (fs.existsSync(envPath)) {
  try {
    require("../clicks-admin-api/node_modules/dotenv").config({ path: envPath });
  } catch {
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  }
}

const ADMIN_URL = (process.env.ADMIN_URL || "https://stg-admin-api.clicks.qa").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@clicks.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin123!";

async function main() {
  const loginRes = await fetch(`${ADMIN_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const login = await loginRes.json();
  const token = login.accessToken || login.token;
  if (!token) {
    console.error("LOGIN FAIL", loginRes.status, login);
    process.exit(1);
  }

  const auth = { Authorization: `Bearer ${token}` };
  const qs = "from=2025-01-01&to=2026-12-31&jobStatus=completed&excludeHistoricalImport=true";
  const paths = [
    `/api/data-analysis/overview?${qs}`,
    `/api/data-analysis/issues?${qs}`,
    `/api/data-analysis/quality?field=issue&${qs}`,
    `/api/data-analysis/catalogs`,
  ];

  let failed = 0;
  for (const urlPath of paths) {
    const res = await fetch(`${ADMIN_URL}${urlPath}`, { headers: auth });
    const ok = res.status === 200;
    console.log(`${ok ? "PASS" : "FAIL"}  ${res.status} ${urlPath}`);
    if (!ok) failed += 1;
  }

  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
