/**
 * In-memory SkipCash for integration tests, injected through the existing
 * `app.set("skipcashFetch", fetchImpl)` / `{ fetchImpl }` pattern.
 *
 *   const sc = fakeSkipcash();
 *   techApp.set("skipcashFetch", sc.fetch);
 *   sc.setStatus(paymentId, 2);           // customer paid
 *   await sendWebhook(techApp, { PaymentId, Amount, StatusId: 2, Custom1 });
 */
const request = require("supertest");
const { signWebhookPayload } = require("../../clicks-shared/utils/skipcash");

const SECRET = "skipcash-ws-de-secret";
const KEY_ID = "11111111-1111-1111-1111-111111111111";
const CLIENT_ID = "skipcash-client-id";

function configureSkipcashEnv() {
  process.env.SKIPCASH_KEY_ID = KEY_ID;
  process.env.SKIPCASH_KEY_SECRET = SECRET;
  process.env.SKIPCASH_CLIENT_ID = CLIENT_ID;
  process.env.SKIPCASH_ENV = "sandbox";
  process.env.SKIPCASH_RETURN_URL = "https://clicks.qa/app/skipcash-return";
  delete process.env.SKIPCASH_WEBHOOK_SECRET;
  delete process.env.SKIPCASH_ENABLED;
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

function ok(resultObj) {
  return jsonResponse({
    resultObj,
    returnCode: 200,
    errorCode: 0,
    hasError: false,
    hasValidationError: false,
  });
}

let seq = 0;

function fakeSkipcash() {
  const payments = new Map();
  const calls = { create: 0, get: 0, refund: 0 };
  const refunds = [];
  let failRefund = null;
  let failGet = false;

  async function fetchImpl(url, opts = {}) {
    const method = String(opts.method || "GET").toUpperCase();
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    if (method === "POST" && path === "/api/v1/payments/refund") {
      calls.refund += 1;
      const body = JSON.parse(opts.body || "{}");
      refunds.push({ body, authorization: opts.headers?.Authorization });
      if (failRefund) return jsonResponse({ hasError: true, errorMessage: failRefund }, 400);
      const p = payments.get(body.PaymentId);
      if (p) p.refunded = (p.refunded || 0) + Number(body.Amount);
      return ok({ id: `refund-${refunds.length}`, statusId: 7 });
    }
    if (method === "POST" && path === "/api/v1/payments") {
      calls.create += 1;
      const body = JSON.parse(opts.body || "{}");
      seq += 1;
      const id = `pay-${Date.now().toString(36)}-${seq}`;
      const payment = {
        id,
        statusId: 0,
        amount: String(body.Amount),
        currency: "QAR",
        payUrl: `https://skipcashtest.azurewebsites.net/pay/${id}`,
        transactionId: body.TransactionId,
        custom1: body.Custom1,
        custom2: body.Custom2,
        created: new Date().toISOString(),
      };
      payments.set(id, payment);
      return ok({ ...payment });
    }
    if (method === "GET" && path.startsWith("/api/v1/payments/")) {
      calls.get += 1;
      if (failGet) return jsonResponse({ errorMessage: "unavailable" }, 503);
      const id = decodeURIComponent(path.slice("/api/v1/payments/".length));
      const payment = payments.get(id);
      if (!payment) return jsonResponse({ errorMessage: "not found" }, 404);
      return ok({ ...payment });
    }
    return jsonResponse({ errorMessage: `unexpected ${method} ${path}` }, 500);
  }

  return {
    fetch: fetchImpl,
    payments,
    calls,
    refunds,
    setStatus(id, statusId) {
      const p = payments.get(id);
      if (!p) throw new Error(`fake SkipCash has no payment ${id}`);
      p.statusId = statusId;
      return p;
    },
    /** Register a payment the code never created (e.g. pre-ledger). */
    seed(payment) {
      payments.set(payment.id, { statusId: 0, currency: "QAR", ...payment });
    },
    failRefundWith(message) {
      failRefund = message;
    },
    failLookups(value = true) {
      failGet = value;
    },
  };
}

async function sendWebhook(app, payload) {
  return request(app)
    .post("/api/webhooks/skipcash")
    .set("Authorization", signWebhookPayload(payload, SECRET))
    .send(payload);
}

module.exports = {
  SECRET,
  configureSkipcashEnv,
  fakeSkipcash,
  sendWebhook,
  jsonResponse,
};
