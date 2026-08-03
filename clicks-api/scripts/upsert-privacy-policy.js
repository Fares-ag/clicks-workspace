#!/usr/bin/env node
/**
 * Publish an active privacy policy to the admin API (production CMS).
 *
 * Usage:
 *   node scripts/upsert-privacy-policy.js
 *
 * Env:
 *   ADMIN_URL, ADMIN_EMAIL, ADMIN_PASSWORD
 *   PRIVACY_VERSION (default 2.0)
 */
const fs = require("fs");
const path = require("path");

const ADMIN_URL = (process.env.ADMIN_URL || "https://clicks-admin-api-production.up.railway.app").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@clicks.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin123!";
const VERSION = process.env.PRIVACY_VERSION || "2.0";

const contentPath = path.join(__dirname, "content", "privacy-policy-v2.html");
const content = fs.readFileSync(contentPath, "utf8");

async function main() {
  const loginRes = await fetch(`${ADMIN_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const loginBody = await loginRes.json().catch(() => ({}));
  if (!loginRes.ok) {
    throw new Error(`Login failed (${loginRes.status}): ${loginBody.message || loginBody.error || "unknown"}`);
  }
  const token = loginBody.accessToken;
  if (!token) throw new Error("Login response missing accessToken");

  const createRes = await fetch(`${ADMIN_URL}/api/privacy-policy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      content,
      version: VERSION,
      effectiveDate: new Date().toISOString(),
      isActive: true,
    }),
  });
  const createBody = await createRes.json().catch(() => ({}));
  if (!createRes.ok) {
    throw new Error(`Create failed (${createRes.status}): ${createBody.error || createBody.details || "unknown"}`);
  }

  console.log(`OK  Active privacy policy v${VERSION} published`);
  console.log(`    GET ${ADMIN_URL}/api/privacy-policy/active`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
