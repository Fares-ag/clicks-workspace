const { randomUUID } = require("crypto");
const {
  formatAmount,
  sanitizePersonName,
  signPaymentPayload,
  signRefundPayload,
  getSkipcashConfig,
} = require("../utils/skipcash");
const { normalizePhoneE164 } = require("../utils/phone");

class SkipcashError extends Error {
  constructor(message, { status = 502, code = "SKIPCASH_ERROR", details } = {}) {
    super(message);
    this.name = "SkipcashError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function requireConfig(env) {
  const cfg = getSkipcashConfig(env);
  if (!cfg.enabled) {
    throw new SkipcashError("Card payment is not available right now", {
      status: 503,
      code: "SKIPCASH_DISABLED",
    });
  }
  return cfg;
}

function shopperFromCustomer(customer, job) {
  const first = sanitizePersonName(
    customer?.first_name || String(job?.clientName || "").split(" ")[0],
    "Customer"
  );
  const lastRaw =
    customer?.last_name ||
    String(job?.clientName || "")
      .split(" ")
      .slice(1)
      .join(" ");
  const last = sanitizePersonName(lastRaw, "Clicks");
  const phone = normalizePhoneE164(
    customer?.phone_number || job?.clientMobileNumber || ""
  );
  const emailRaw = String(customer?.email || job?.clientEmail || "").trim();
  const digits = String(phone || "").replace(/\D/g, "").slice(-8);
  const email = emailRaw || `${digits || "customer"}@clicks.qa`;
  return { first, last, phone, email };
}

function buildCreatePayload({
  cfg,
  amount,
  customer,
  job,
  transactionId,
  custom1,
  custom2,
  subject,
  description,
}) {
  const shopper = shopperFromCustomer(customer, job);
  const reference = String(job?.job_reference || "").trim() || String(job?._id || "");
  const payload = {
    Uid: randomUUID(),
    KeyId: cfg.keyId,
    Amount: amount,
    FirstName: shopper.first,
    LastName: shopper.last,
    Phone: shopper.phone,
    Email: shopper.email,
    TransactionId: transactionId,
    Custom1: custom1,
    Subject: subject || "Clicks roadside assistance",
    Description: (description || reference).slice(0, 120),
  };
  if (custom2) payload.Custom2 = custom2;
  if (cfg.returnUrl) payload.ReturnUrl = cfg.returnUrl;
  if (cfg.webhookUrl) payload.WebhookUrl = cfg.webhookUrl;
  return payload;
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { errorMessage: text };
  }
}

function assertSkipcashResult(json, fallback) {
  if (json && json.resultObj && !json.hasError && !json.hasValidationError) {
    return json.resultObj;
  }
  const message =
    json?.errorMessage ||
    json?.error ||
    (Array.isArray(json?.validationErrors) && json.validationErrors[0]) ||
    fallback;
  throw new SkipcashError(String(message), { details: json });
}

async function createPayment(input, { fetchImpl, env } = {}) {
  const cfg = requireConfig(env);
  const amount = formatAmount(input.amount);
  if (!amount) {
    throw new SkipcashError("Invalid payment amount", {
      status: 400,
      code: "SKIPCASH_INVALID_AMOUNT",
    });
  }
  const payload = buildCreatePayload({
    cfg,
    amount,
    customer: input.customer,
    job: input.job,
    transactionId: input.transactionId,
    custom1: input.custom1,
    custom2: input.custom2,
    subject: input.subject,
    description: input.description,
  });
  const doFetch = fetchImpl || fetch;
  const response = await doFetch(`${cfg.baseUrl}/api/v1/payments`, {
    method: "POST",
    headers: {
      Authorization: signPaymentPayload(payload, cfg.keySecret),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  const json = await readJson(response);
  if (!response.ok) {
    throw new SkipcashError(
      json.errorMessage || json.error || `SkipCash create failed (${response.status})`,
      { details: json }
    );
  }
  return assertSkipcashResult(json, "SkipCash create payment failed");
}

async function getPayment(paymentId, { fetchImpl, env } = {}) {
  const cfg = requireConfig(env);
  const id = String(paymentId || "").trim();
  if (!id) {
    throw new SkipcashError("Missing SkipCash payment id", {
      status: 400,
      code: "SKIPCASH_MISSING_PAYMENT",
    });
  }
  const doFetch = fetchImpl || fetch;
  const response = await doFetch(`${cfg.baseUrl}/api/v1/payments/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: {
      Authorization: cfg.clientId,
      Accept: "application/json",
    },
  });
  const json = await readJson(response);
  if (!response.ok) {
    throw new SkipcashError(
      json.errorMessage || json.error || `SkipCash lookup failed (${response.status})`,
      { details: json }
    );
  }
  return assertSkipcashResult(json, "SkipCash payment lookup failed");
}

/**
 * Ask SkipCash to refund (part of) a captured payment.
 *
 * ASSUMPTION — verify against the SkipCash merchant docs before go-live:
 *   POST {baseUrl}{SKIPCASH_REFUND_PATH || "/api/v1/payments/refund"}
 *   body: { Uid, KeyId, PaymentId, Amount }   (Amount "10.00", partial allowed)
 *   Authorization: HMAC-SHA256(key secret) over "Uid=..,KeyId=..,PaymentId=..,Amount=.."
 *   response: { resultObj: { id | refundId, statusId }, hasError, ... }
 * This mirrors the create-payment contract. Everything provider-specific is in
 * this one function; if the live API differs, only this function changes. When
 * the call fails, the refund stays `failed` and finance completes it in the
 * SkipCash portal, then records the portal reference (manual fallback).
 *
 * @returns {Promise<{ refundId: string, statusId: number|null, raw: object }>}
 */
async function refundPayment(paymentId, { amount } = {}, { fetchImpl, env } = {}) {
  const cfg = requireConfig(env);
  const id = String(paymentId || "").trim();
  if (!id) {
    throw new SkipcashError("Missing SkipCash payment id", {
      status: 400,
      code: "SKIPCASH_MISSING_PAYMENT",
    });
  }
  const formatted = formatAmount(amount);
  if (!formatted) {
    throw new SkipcashError("Invalid refund amount", {
      status: 400,
      code: "SKIPCASH_INVALID_AMOUNT",
    });
  }
  const payload = {
    Uid: randomUUID(),
    KeyId: cfg.keyId,
    PaymentId: id,
    Amount: formatted,
  };
  const path =
    String((env || process.env).SKIPCASH_REFUND_PATH || "").trim() || "/api/v1/payments/refund";
  const doFetch = fetchImpl || fetch;
  const response = await doFetch(`${cfg.baseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: signRefundPayload(payload, cfg.keySecret),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  const json = await readJson(response);
  if (!response.ok) {
    throw new SkipcashError(
      json.errorMessage || json.error || `SkipCash refund failed (${response.status})`,
      { details: json, code: "SKIPCASH_REFUND_FAILED" }
    );
  }
  const result = assertSkipcashResult(json, "SkipCash refund failed");
  return {
    refundId: String(result.refundId || result.id || result.RefundId || "").trim(),
    statusId: result.statusId ?? result.StatusId ?? null,
    raw: json,
  };
}

module.exports = {
  SkipcashError,
  requireConfig,
  shopperFromCustomer,
  buildCreatePayload,
  createPayment,
  getPayment,
  refundPayment,
};
