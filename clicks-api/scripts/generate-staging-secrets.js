#!/usr/bin/env node
/**
 * Print staging secrets to stdout (never writes files).
 * Usage: node scripts/generate-staging-secrets.js
 */
const crypto = require("crypto");

function secret(bytes = 48) {
  return crypto.randomBytes(bytes).toString("base64url");
}

const jwt = secret();
const jwtRefresh = secret();
const internal = secret();

console.log(`# Paste into BOTH admin-api and customer-tech-api .env
JWT_SECRET=${jwt}

# admin-api only
JWT_REFRESH_SECRET=${jwtRefresh}

# Paste into BOTH APIs
INTERNAL_API_SECRET=${internal}

# Reminder:
# - JWT_SECRET must match on admin + customer-tech
# - INTERNAL_API_SECRET must match on admin + customer-tech
# - Restart both APIs together after applying
# - Do not commit these values
`);
