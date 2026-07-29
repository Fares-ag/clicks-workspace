/**
 * Fail fast if critical production env vars are missing.
 * Set REQUIRE_STRICT_ENV=false only for local throwaway experiments.
 */
function requireEnv(keys = []) {
  const strict =
    process.env.REQUIRE_STRICT_ENV !== "false" &&
    process.env.NODE_ENV === "production";

  // Always require JWT secrets even outside production — never fall back to "secret"
  const alwaysRequired = [
    "JWT_SECRET",
    "MONGODB_URI",
    // JWT_REFRESH_SECRET and INTERNAL_API_SECRET are strongly recommended but
    // degrade gracefully (refresh token and internal calls fail; server still starts).
  ];
  const missing = [...new Set([...alwaysRequired, ...keys])].filter(
    (k) => !process.env[k] || String(process.env[k]).trim() === ""
  );

  if (missing.length) {
    const msg = `Missing required environment variables: ${missing.join(", ")}`;
    if (strict || alwaysRequired.some((k) => missing.includes(k))) {
      console.error(msg);
      process.exit(1);
    }
    console.warn(msg);
  }
}

function getCorsOrigins() {
  const raw = process.env.CORS_ORIGINS || process.env.FRONTEND_URL || "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

module.exports = { requireEnv, getCorsOrigins };
