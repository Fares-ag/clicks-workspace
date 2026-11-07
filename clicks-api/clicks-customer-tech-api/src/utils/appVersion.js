/**
 * Minimum app version (scenario 19).
 *
 *   MIN_APP_VERSION_IOS / MIN_APP_VERSION_ANDROID   e.g. "1.0.0" (unset = no minimum)
 *   APP_STORE_URL_IOS / APP_STORE_URL_ANDROID       where the update screen sends people
 *
 * The app sends `X-App-Version` and `X-Platform` on every request. The splash
 * screen reads /api/config/public and blocks on an outdated build; the gate
 * below is the server-side backstop that answers 426 APP_UPDATE_REQUIRED to
 * an outdated client that skipped the splash check. Requests without the
 * headers (admin tools, tests, older internal callers) are never gated.
 */

function parseVersion(raw) {
  const core = String(raw || "").trim().split(/[+\s]/)[0];
  if (!/^\d+(\.\d+){0,3}$/.test(core)) return null;
  const parts = core.split(".").map((n) => Number.parseInt(n, 10));
  while (parts.length < 3) parts.push(0);
  return parts;
}

/** -1 / 0 / 1, or null when either side is not a version. */
function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return null;
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

function normalizePlatform(raw) {
  const p = String(raw || "").trim().toLowerCase();
  if (p === "ios" || p === "iphone" || p === "ipad") return "ios";
  if (p === "android") return "android";
  return "";
}

function minAppVersions(env = process.env) {
  return {
    ios: String(env.MIN_APP_VERSION_IOS || "").trim() || null,
    android: String(env.MIN_APP_VERSION_ANDROID || "").trim() || null,
  };
}

function storeUrls(env = process.env) {
  return {
    ios: String(env.APP_STORE_URL_IOS || "").trim() || null,
    android: String(env.APP_STORE_URL_ANDROID || "").trim() || null,
  };
}

function isBelowMinimum(version, platform, env = process.env) {
  const min = minAppVersions(env)[normalizePlatform(platform)];
  if (!min) return false;
  const cmp = compareVersions(version, min);
  return cmp === -1;
}

const UNGATED_PREFIXES = ["/api/config", "/api/health", "/api/webhooks", "/api/launch-flags"];

function appVersionGate(req, res, next) {
  const version = req.headers["x-app-version"];
  const platform = req.headers["x-platform"];
  if (!version || !platform) return next();
  if (UNGATED_PREFIXES.some((p) => req.path.startsWith(p))) return next();
  if (!isBelowMinimum(version, platform)) return next();
  const key = normalizePlatform(platform);
  return res.status(426).json({
    error: "Please update the Clicks app to continue.",
    code: "APP_UPDATE_REQUIRED",
    min_app_version: minAppVersions()[key],
    store_url: storeUrls()[key],
  });
}

module.exports = {
  parseVersion,
  compareVersions,
  normalizePlatform,
  minAppVersions,
  storeUrls,
  isBelowMinimum,
  appVersionGate,
};
