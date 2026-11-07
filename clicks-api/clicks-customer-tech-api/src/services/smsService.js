/**
 * Provider-agnostic SMS sender.
 *
 * SMS_PROVIDER:
 *   console  — log only (default / local)
 *   http     — generic POST JSON { to, message, from }
 *   smsala   — SMSala SendSmsV2 (apiToken) — https://api2.smsala.com/SendSmsV2
 *
 * SMSala env:
 *   SMSALA_API_TOKEN   (required)
 *   SMSALA_API_URL     (optional, default https://api2.smsala.com/SendSmsV2)
 *   SMS_FROM / SMSALA_SOURCE_ADDRESS  — approved sender ID (Qatar: "Sanad RSA")
 *   SMSALA_MESSAGE_TYPE     1=Promotional 2=Transactional 3=OTP (default "3")
 *   SMSALA_MESSAGE_ENCODING default "1" (text); use "3" for unicode if needed
 */

const crypto = require("crypto");

// NOTE (audit stage 1): this in-memory store is per-process. It is voided on
// every deploy and does not work at all under cluster mode. The persisted
// OTPVerification collection is the real store; this remains only for any
// legacy caller. Do not add new callers.
let otpStore = {};

const generateOTP = (phone) => {
  // Was Math.random(), which is xorshift128+, not a CSPRNG — harvest a few
  // codes from accounts you control and you can predict a victim's.
  const otp = String(crypto.randomInt(100000, 1000000));
  otpStore[phone] = { otp, expires: Date.now() + 5 * 60 * 1000 };
  return otp;
};

/** Digits only, country code included, no leading + (SMSala requirement). */
function normalizePhone(to) {
  const digits = String(to || "").replace(/\D/g, "");
  if (!digits) {
    throw new Error("Invalid phone number for SMS");
  }
  return digits;
}

async function sendViaHttp(to, message) {
  const url = process.env.SMS_HTTP_URL;
  if (!url) {
    throw new Error("SMS_HTTP_URL is required when SMS_PROVIDER=http");
  }
  const headers = {
    "Content-Type": "application/json",
  };
  if (process.env.SMS_HTTP_AUTH_HEADER) {
    headers.Authorization = process.env.SMS_HTTP_AUTH_HEADER;
  }
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      to,
      message,
      from: process.env.SMS_FROM || "Clicks",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SMS HTTP provider failed: ${res.status} ${text}`);
  }
  return { ok: true, provider: "http" };
}

/**
 * SMSala token API (dashboard ManageApi endpoint / apiToken).
 * @see https://smsala.com/wp-content/uploads/api-integration-documentation-for-smsala.pdf
 */
async function sendViaSmsala(to, message) {
  const apiToken = process.env.SMSALA_API_TOKEN;
  if (!apiToken) {
    throw new Error("SMSALA_API_TOKEN is required when SMS_PROVIDER=smsala");
  }

  const url = process.env.SMSALA_API_URL || "https://api2.smsala.com/SendSmsV2";
  const sourceAddress =
    process.env.SMSALA_SOURCE_ADDRESS || process.env.SMS_FROM || "Sanad RSA";
  const destinationAddress = normalizePhone(to);

  const payload = [
    {
      apiToken,
      // 1=Promotional 2=Transactional 3=OTP — Qatar rejects unapproved sender IDs
      messageType: process.env.SMSALA_MESSAGE_TYPE || "3",
      messageEncoding: process.env.SMSALA_MESSAGE_ENCODING || "1",
      destinationAddress,
      sourceAddress,
      messageText: message,
    },
  ];

  if (process.env.SMSALA_CALLBACK_URL) {
    payload[0].callBackUrl = process.env.SMSALA_CALLBACK_URL;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    throw new Error(`SMSala send failed: ${res.status} ${text}`);
  }

  // SMSala answers HTTP 200 for rejected sends too (bad sender ID, empty
  // balance, invalid number) — the verdict is in the body. Treating every 2xx
  // as delivered meant OTPs silently never arrived (scenario 9).
  const bodyError = smsalaBodyError(body);
  if (bodyError) {
    throw new Error(`SMSala rejected send: ${bodyError}`);
  }

  console.log(
    JSON.stringify({
      level: "info",
      msg: "sms_sent",
      provider: "smsala",
      to: destinationAddress.replace(/.(?=.{4})/g, "*"),
      status: res.status,
    })
  );

  return { ok: true, provider: "smsala", response: body };
}

/**
 * Extract an error from a SMSala response body, or null when it reports
 * success. Success looks like `{"Status":"Success", ...}` (possibly wrapped in
 * an array, one entry per destination).
 */
function smsalaBodyError(body) {
  if (body == null || body === "") return "empty response body";
  if (typeof body === "string") {
    return /error|invalid|fail|insufficient|denied|unauthori[sz]ed/i.test(body)
      ? body.slice(0, 200)
      : null;
  }
  const entries = Array.isArray(body) ? body : [body];
  if (!entries.length) return "empty response body";
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") return "malformed response body";
    const get = (name) => {
      const key = Object.keys(entry).find((k) => k.toLowerCase() === name);
      return key === undefined ? undefined : entry[key];
    };
    const status = get("status");
    const errorCode = get("errorcode");
    const message = get("message") || get("statusdescription") || get("error");
    if (status !== undefined && !/^(success|ok|sent|accepted|true)$/i.test(String(status))) {
      return `${status}${message ? `: ${message}` : ""}`.slice(0, 200);
    }
    if (errorCode !== undefined && errorCode !== null && !["0", ""].includes(String(errorCode))) {
      return `error code ${errorCode}${message ? `: ${message}` : ""}`.slice(0, 200);
    }
    if (status === undefined && get("error")) {
      return String(get("error")).slice(0, 200);
    }
  }
  return null;
}

async function sendSMS(to, message) {
  const provider = (process.env.SMS_PROVIDER || "console").toLowerCase();

  // Never log OTPs instead of sending them in production. Boot already
  // refuses this config (assertProductionConfig); this guards a runtime
  // env edit that skipped a restart.
  if (process.env.NODE_ENV === "production" && provider === "console") {
    throw new Error("SMS_PROVIDER=console is not allowed in production");
  }

  if (provider === "smsala") {
    return sendViaSmsala(to, message);
  }

  if (provider === "http") {
    return sendViaHttp(to, message);
  }

  // Default / local: console mock
  console.log(`[SMS:${provider}] to=${to} message=${message}`);
  return { ok: true, provider: "console" };
}

const sendOTP = async (phone) => {
  const otp = generateOTP(phone);
  await sendSMS(phone, `Your Clicks OTP is: ${otp}. Valid for 5 minutes.`);
  return otp;
};

const verifyOTP = (phone, otp) => {
  const record = otpStore[phone];
  if (!record) return false;
  if (Date.now() > record.expires) return false;
  return record.otp === otp;
};

module.exports = {
  sendSMS,
  sendOTP,
  verifyOTP,
  generateOTP,
  normalizePhone,
  smsalaBodyError,
};
