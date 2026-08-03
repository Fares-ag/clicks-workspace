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

let otpStore = {};

const generateOTP = (phone) => {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
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

async function sendSMS(to, message) {
  const provider = (process.env.SMS_PROVIDER || "console").toLowerCase();

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
};
