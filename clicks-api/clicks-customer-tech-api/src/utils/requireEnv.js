/**
 * Fail fast if critical env vars are missing.
 * Never allow JWT_SECRET to fall back to a hardcoded default.
 */
function requireEnv(keys = []) {
  // Hard-crash if these are absent — the server cannot operate without them.
  const alwaysFatal = ["JWT_SECRET", "MONGODB_URI"];
  // Warn but don't crash — missing these degrades optional features only.
  const alwaysWarn = ["INTERNAL_API_SECRET"];
  const all = [...new Set([...alwaysFatal, ...alwaysWarn, ...keys])];
  const missing = all.filter(
    (k) => !process.env[k] || String(process.env[k]).trim() === ""
  );

  const fatal = missing.filter((k) => alwaysFatal.includes(k));
  const warn = missing.filter((k) => !alwaysFatal.includes(k));

  if (warn.length) {
    console.warn(
      `[WARN] Optional env vars not set: ${warn.join(", ")}. Some features may not work.`
    );
  }
  if (fatal.length) {
    console.error(
      `Missing required environment variables: ${fatal.join(", ")}`
    );
    process.exit(1);
  }
}

function getCorsOrigins() {
  const raw = process.env.CORS_ORIGINS || "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

module.exports = { requireEnv, getCorsOrigins };
