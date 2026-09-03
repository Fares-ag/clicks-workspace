function assertProductionBlocked(url) {
  const u = String(url || "").toLowerCase();
  if (u.includes("production") || u.includes("clicks-production") || u.includes("prod.up.railway.app")) {
    throw new Error(`Refusing load test against production URL: ${url}`);
  }
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

const BASE_ADMIN = process.env.STAGING_ADMIN_BASE || process.env.BASE_ADMIN || "";
const BASE_TECH = process.env.STAGING_TECH_BASE || process.env.BASE_TECH || "";

assertProductionBlocked(BASE_ADMIN);
assertProductionBlocked(BASE_TECH);

module.exports = {
  BASE_ADMIN,
  BASE_TECH,
  STAGING_ADMIN_TOKEN: process.env.STAGING_ADMIN_TOKEN,
  STAGING_TECH_TOKEN: process.env.STAGING_TECH_TOKEN,
  STAGING_CUSTOMER_TOKEN: process.env.STAGING_CUSTOMER_TOKEN,
  STAGING_BUSINESS_TOKEN: process.env.STAGING_BUSINESS_TOKEN,
  STAGING_FINANCE_TOKEN: process.env.STAGING_FINANCE_TOKEN,
  requireEnv,
  assertProductionBlocked,
};
