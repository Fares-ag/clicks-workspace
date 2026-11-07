/**
 * Customer JWTs (scenarios 12, 13).
 *
 * Every token carries `tv` = Customer.token_version. Bumping the version on
 * password reset / change, "log out everywhere" and deletion revokes every
 * token issued before it. Tokens minted before this change have no `tv`,
 * which is read as 0 — the schema default — so they keep working until the
 * first bump.
 *
 *   CUSTOMER_TOKEN_TTL                 default "7d"
 *   CUSTOMER_TOKEN_REFRESH_WINDOW_DAYS default 3  — refresh issues a new token
 *                                      once fewer than this many days remain
 *   CUSTOMER_TOKEN_REFRESH_GRACE_DAYS  default 7  — an EXPIRED token can still
 *                                      be exchanged this long after expiry, so
 *                                      a customer on the hard shoulder is never
 *                                      bounced to Login; `tv` still applies.
 */
const jwt = require("jsonwebtoken");

const DAY_S = 24 * 60 * 60;

function numEnv(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function tokenVersionOf(customer) {
  const v = Number(customer?.token_version);
  return Number.isFinite(v) ? v : 0;
}

function claimVersion(decoded) {
  const v = Number(decoded?.tv);
  return Number.isFinite(v) ? v : 0;
}

function signCustomerToken(customer) {
  return jwt.sign(
    { id: String(customer._id), role: "customer", tv: tokenVersionOf(customer) },
    process.env.JWT_SECRET,
    { expiresIn: process.env.CUSTOMER_TOKEN_TTL || "7d" }
  );
}

/**
 * Verify for the refresh endpoint: signature always, expiry within grace.
 * @returns {object|null} decoded payload
 */
function verifyForRefresh(token) {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { ignoreExpiration: true });
    if (decoded?.role !== "customer" || !decoded.id) return null;
    const graceS = numEnv("CUSTOMER_TOKEN_REFRESH_GRACE_DAYS", 7) * DAY_S;
    const nowS = Math.floor(Date.now() / 1000);
    if (decoded.exp && nowS > decoded.exp + graceS) return null;
    return decoded;
  } catch {
    return null;
  }
}

function needsRefresh(decoded) {
  if (!decoded?.exp) return true;
  const windowS = numEnv("CUSTOMER_TOKEN_REFRESH_WINDOW_DAYS", 3) * DAY_S;
  return decoded.exp - Math.floor(Date.now() / 1000) < windowS;
}

module.exports = {
  signCustomerToken,
  verifyForRefresh,
  needsRefresh,
  tokenVersionOf,
  claimVersion,
};
