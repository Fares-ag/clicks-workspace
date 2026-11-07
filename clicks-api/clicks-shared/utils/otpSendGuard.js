/**
 * Per-phone OTP send caps + the launch country allowlist (scenario 11).
 *
 *   OTP_SENDS_PER_HOUR  default 3
 *   OTP_SENDS_PER_DAY   default 10
 *   OTP_ALLOWED_PREFIXES default "+974"
 *
 * The IP limiter alone does not stop SMS bombing of one number (an attacker
 * rotates IPs) and, behind carrier NAT, punishes everyone sharing an IP. The
 * cap is keyed by the normalised E.164 number so "55512345", "+97455512345"
 * and "974 5551 2345" all bill against the same bucket.
 *
 * Insert-then-count (rather than count-then-insert) so two parallel requests
 * cannot both see "2 sent" and both go through.
 */
const OtpSendLog = require("../models/OtpSendLog");
const { normalizePhoneE164, isOtpAllowedPhone } = require("./phone");

function intEnv(name, fallback) {
  const n = Number.parseInt(process.env[name], 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * @returns {Promise<{ok: true} | {ok: false, status: number, code: string, error: string}>}
 */
async function reserveOtpSend(rawPhone, { purpose = "", ip = "" } = {}) {
  const phone = normalizePhoneE164(rawPhone);
  if (!isOtpAllowedPhone(phone)) {
    return {
      ok: false,
      status: 400,
      code: "PHONE_COUNTRY_NOT_SUPPORTED",
      error: "Verification codes can only be sent to Qatar (+974) numbers",
    };
  }

  const perHour = intEnv("OTP_SENDS_PER_HOUR", 3);
  const perDay = intEnv("OTP_SENDS_PER_DAY", 10);
  const now = Date.now();

  const row = await OtpSendLog.create({ phone, purpose, ip: String(ip || "") });
  const [lastHour, lastDay] = await Promise.all([
    OtpSendLog.countDocuments({ phone, created_at: { $gt: new Date(now - HOUR_MS) } }),
    OtpSendLog.countDocuments({ phone, created_at: { $gt: new Date(now - DAY_MS) } }),
  ]);

  if (lastHour > perHour || lastDay > perDay) {
    // Refused sends must not count, or a blocked attacker keeps the real
    // customer locked out for the whole day.
    await OtpSendLog.deleteOne({ _id: row._id });
    return {
      ok: false,
      status: 429,
      code: "OTP_SEND_LIMIT",
      error:
        lastDay > perDay
          ? "Too many codes requested for this number today. Try again tomorrow."
          : "Too many codes requested for this number. Try again in an hour.",
    };
  }
  await maybeAlertDailyVolume(now);
  return { ok: true, phone };
}

/**
 * Daily SMS volume metric. Logs the running count and raises one Sentry event
 * the moment the day's total crosses OTP_DAILY_ALERT_THRESHOLD (default 500),
 * so a pumping attack or a retry loop is noticed before SMSala runs dry.
 */
async function maybeAlertDailyVolume(now = Date.now()) {
  try {
    const threshold = intEnv("OTP_DAILY_ALERT_THRESHOLD", 500);
    const startOfDay = new Date(now);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const total = await OtpSendLog.countDocuments({ created_at: { $gte: startOfDay } });
    if (total === threshold) {
      const msg = `OTP SMS volume reached ${total} today (threshold ${threshold})`;
      console.error(JSON.stringify({ level: "error", msg: "otp_daily_threshold", total, threshold }));
      const { captureException } = require("../middleware/sentry");
      captureException(new Error(msg), { source: "otp_daily_threshold" });
    }
  } catch (err) {
    console.error("otp daily metric failed:", err.message);
  }
}

module.exports = { reserveOtpSend };
