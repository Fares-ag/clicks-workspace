const crypto = require("crypto");

/** Fields SkipCash includes in the create-payment Authorization HMAC, in order. */
const PAYMENT_SIGN_KEYS = [
  "Uid",
  "KeyId",
  "Amount",
  "FirstName",
  "LastName",
  "Phone",
  "Email",
  "Street",
  "City",
  "State",
  "Country",
  "PostalCode",
  "TransactionId",
  "Custom1",
];

/** Fields SkipCash includes in the webhook Authorization HMAC, in order. */
const WEBHOOK_SIGN_KEYS = [
  "PaymentId",
  "Amount",
  "StatusId",
  "TransactionId",
  "Custom1",
  "VisaId",
];

const SKIPCASH_STATUS = {
  NEW: 0,
  PENDING: 1,
  PAID: 2,
  CANCELED: 3,
  FAILED: 4,
  REJECTED: 5,
  REFUNDED: 6,
  PENDING_REFUND: 7,
  REFUND_FAILED: 8,
  CUSTOMER_STARTED: 12,
};

const SANDBOX_BASE_URL = "https://skipcashtest.azurewebsites.net";
const PRODUCTION_BASE_URL = "https://api.skipcash.app";

function isPaidStatus(statusId) {
  return Number(statusId) === SKIPCASH_STATUS.PAID;
}

function isReusableStatus(statusId) {
  const n = Number(statusId);
  return (
    n === SKIPCASH_STATUS.NEW ||
    n === SKIPCASH_STATUS.PENDING ||
    n === SKIPCASH_STATUS.CUSTOMER_STARTED
  );
}

function formatAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return (Math.round(n * 100) / 100).toFixed(2);
}

function amountsMatch(a, b) {
  const left = formatAmount(a);
  const right = formatAmount(b);
  return Boolean(left && right && left === right);
}

function sanitizePersonName(raw, fallback = "Customer") {
  const cleaned = String(raw || "")
    .replace(/[^A-Za-z\u0600-\u06FF\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return cleaned || fallback;
}

function combineSignedFields(obj, keys) {
  const parts = [];
  for (const key of keys) {
    if (!obj || !Object.prototype.hasOwnProperty.call(obj, key)) continue;
    const value = obj[key];
    if (value === undefined || value === null) continue;
    const str = String(value);
    if (str === "") continue;
    parts.push(`${key}=${str}`);
  }
  return parts.join(",");
}

function hmacBase64(message, secret) {
  return crypto
    .createHmac("sha256", String(secret))
    .update(String(message), "utf8")
    .digest("base64");
}

function signPaymentPayload(payload, secret) {
  return hmacBase64(combineSignedFields(payload, PAYMENT_SIGN_KEYS), secret);
}

function signWebhookPayload(payload, secret) {
  return hmacBase64(combineSignedFields(payload, WEBHOOK_SIGN_KEYS), secret);
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function verifyWebhookSignature(payload, authorization, secret) {
  if (!authorization || !secret) return false;
  const expected = signWebhookPayload(payload, secret);
  return safeEqual(expected, String(authorization).trim());
}

function buildTransactionId(jobId) {
  const id = String(jobId || "").replace(/[^a-zA-Z0-9]/g, "").slice(-24);
  const rand = crypto.randomBytes(4).toString("hex");
  return `${id}${rand}`.slice(0, 40);
}

function skipcashBaseUrl(env = process.env.SKIPCASH_ENV, override) {
  if (override && String(override).trim()) return String(override).replace(/\/+$/, "");
  const mode = String(env || "sandbox").toLowerCase();
  return mode === "production" ? PRODUCTION_BASE_URL : SANDBOX_BASE_URL;
}

function getSkipcashConfig(env = process.env) {
  const keyId = String(env.SKIPCASH_KEY_ID || "").trim();
  const keySecret = String(env.SKIPCASH_KEY_SECRET || "").trim();
  const clientId = String(env.SKIPCASH_CLIENT_ID || "").trim();
  const explicit = String(env.SKIPCASH_ENABLED || "").trim().toLowerCase();
  const keysPresent = Boolean(keyId && keySecret && clientId);
  const enabled =
    explicit === "false" || explicit === "0" || explicit === "off"
      ? false
      : keysPresent;
  return {
    enabled,
    keyId,
    keySecret,
    clientId,
    webhookSecret: String(env.SKIPCASH_WEBHOOK_SECRET || keySecret).trim(),
    baseUrl: skipcashBaseUrl(env.SKIPCASH_ENV, env.SKIPCASH_BASE_URL),
    returnUrl: String(env.SKIPCASH_RETURN_URL || "https://clicks.qa/app/skipcash-return").trim(),
    webhookUrl: String(env.SKIPCASH_WEBHOOK_URL || "").trim(),
  };
}

module.exports = {
  PAYMENT_SIGN_KEYS,
  WEBHOOK_SIGN_KEYS,
  SKIPCASH_STATUS,
  SANDBOX_BASE_URL,
  PRODUCTION_BASE_URL,
  isPaidStatus,
  isReusableStatus,
  formatAmount,
  amountsMatch,
  sanitizePersonName,
  combineSignedFields,
  signPaymentPayload,
  signWebhookPayload,
  verifyWebhookSignature,
  buildTransactionId,
  skipcashBaseUrl,
  getSkipcashConfig,
};
