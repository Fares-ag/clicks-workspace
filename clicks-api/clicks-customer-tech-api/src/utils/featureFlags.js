/**
 * Soft-launch / production feature flags.
 * Defaults are permissive for local/staging; lock down in production env.
 */
function flag(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(String(raw).toLowerCase());
}

function getLaunchFlags() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    publicSos: flag("LAUNCH_PUBLIC_SOS", !isProd),
    publicSignup: flag("LAUNCH_PUBLIC_SIGNUP", !isProd),
    region: process.env.LAUNCH_REGION || "QA",
  };
}

function requirePublicSos(req, res, next) {
  const { publicSos } = getLaunchFlags();
  if (!publicSos) {
    return res.status(503).json({
      error: "SOS is temporarily disabled",
      code: "LAUNCH_PUBLIC_SOS_OFF",
    });
  }
  next();
}

function requirePublicSignup(req, res, next) {
  const { publicSignup } = getLaunchFlags();
  if (!publicSignup) {
    return res.status(503).json({
      error: "Public signup is temporarily disabled",
      code: "LAUNCH_PUBLIC_SIGNUP_OFF",
    });
  }
  next();
}

module.exports = {
  getLaunchFlags,
  requirePublicSos,
  requirePublicSignup,
  flag,
};
