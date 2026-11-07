/**
 * Boot-time production configuration guard (WS-I item 1).
 *
 * Several launch blockers were "one env var missing in Railway" problems:
 * SOS silently OFF (S27), OTPs written to logs instead of sent (S9), every
 * SkipCash webhook 401'd (S81), and two instances splitting the in-memory
 * socket adapter so half the dispatchers never saw an SOS (S66). None of
 * them crash, so nothing noticed. In production we now refuse to start.
 *
 * Pure check (`checkProductionConfig`) + a thin asserting wrapper, so each
 * rule is unit-testable without spawning a process.
 */

const isBlank = (v) => v === undefined || v === null || String(v).trim() === "";

const FLAG_NAMES = [
  "LAUNCH_PUBLIC_SOS",
  "LAUNCH_PUBLIC_SIGNUP",
  "LAUNCH_CUSTOMER_MEMBERSHIP",
  "LAUNCH_REGION",
  "SINGLE_INSTANCE",
  "SMS_PROVIDER",
  "OTP_ALLOWED_PREFIXES",
  "MIN_APP_VERSION_IOS",
  "MIN_APP_VERSION_ANDROID",
];

/**
 * @param {object} env  usually process.env
 * @param {{ service?: "tech" | "admin" }} [opts]
 * @returns {{ production: boolean, errors: string[], warnings: string[], flags: object }}
 */
function checkProductionConfig(env = process.env, { service = "tech" } = {}) {
  const production = env.NODE_ENV === "production";
  const errors = [];
  const warnings = [];

  const flags = {};
  for (const name of FLAG_NAMES) {
    flags[name] = isBlank(env[name]) ? "(unset)" : String(env[name]);
  }

  if (!production) return { production, errors, warnings, flags };

  // Both APIs serve browsers / apps with credentials.
  const cors = service === "admin" ? env.CORS_ORIGINS || env.FRONTEND_URL : env.CORS_ORIGINS;
  if (isBlank(cors)) {
    errors.push("CORS_ORIGINS is empty");
  }

  if (service === "tech") {
    if (isBlank(env.LAUNCH_PUBLIC_SOS)) {
      errors.push(
        "LAUNCH_PUBLIC_SOS is not set explicitly (it defaults to OFF in production)"
      );
    }
    if (isBlank(env.SKIPCASH_WEBHOOK_SECRET)) {
      errors.push("SKIPCASH_WEBHOOK_SECRET is empty (every card webhook would 401)");
    }
    const sms = String(env.SMS_PROVIDER || "").trim().toLowerCase();
    if (!sms || sms === "console") {
      errors.push("SMS_PROVIDER is console or unset (OTPs would be logged, not sent)");
    }
    const single = String(env.SINGLE_INSTANCE || "").trim().toLowerCase() === "true";
    if (isBlank(env.REDIS_URL) && !single) {
      errors.push(
        "Neither REDIS_URL nor SINGLE_INSTANCE=true is set (sockets split across instances)"
      );
    }
    if (isBlank(env.SUPPORT_PHONE)) {
      warnings.push("SUPPORT_PHONE is unset — /api/config/public falls back to the app constant");
    }
  }

  if (isBlank(env.SENTRY_DSN)) {
    warnings.push("SENTRY_DSN is unset — production errors will not be reported");
  }

  return { production, errors, warnings, flags };
}

/**
 * Logs every flag and warning; throws when production config is unsafe.
 * Call before connecting to Mongo or listening.
 */
function assertProductionConfig({ service = "tech", env = process.env, logger = console } = {}) {
  const result = checkProductionConfig(env, { service });
  logger.log(
    JSON.stringify({ level: "info", msg: "launch_flags", service, flags: result.flags })
  );
  for (const warning of result.warnings) {
    logger.warn(JSON.stringify({ level: "warn", msg: "config_warning", service, warning }));
  }
  if (result.errors.length) {
    const err = new Error(
      `Refusing to start ${service} API in production:\n - ${result.errors.join("\n - ")}`
    );
    err.code = "UNSAFE_PRODUCTION_CONFIG";
    err.errors = result.errors;
    throw err;
  }
  return result;
}

module.exports = { checkProductionConfig, assertProductionConfig, FLAG_NAMES };
