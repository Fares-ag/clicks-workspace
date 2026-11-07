const test = require("node:test");
const assert = require("node:assert/strict");
const {
  formatAmount,
  amountsMatch,
  sanitizePersonName,
  combineSignedFields,
  signPaymentPayload,
  signWebhookPayload,
  verifyWebhookSignature,
  isPaidStatus,
  isReusableStatus,
  buildTransactionId,
  skipcashBaseUrl,
  getSkipcashConfig,
  PAYMENT_SIGN_KEYS,
  SANDBOX_BASE_URL,
  PRODUCTION_BASE_URL,
} = require("./skipcash");

test("formatAmount always uses two decimal places", () => {
  assert.equal(formatAmount(150), "150.00");
  assert.equal(formatAmount("99.9"), "99.90");
  assert.equal(formatAmount(0), null);
  assert.equal(formatAmount(-5), null);
});

test("amountsMatch compares formatted QAR values", () => {
  assert.equal(amountsMatch(150, "150.00"), true);
  assert.equal(amountsMatch(150.1, "150.10"), true);
  assert.equal(amountsMatch(150, "149.00"), false);
});

test("sanitizePersonName strips special characters", () => {
  assert.equal(sanitizePersonName("Fatima-Al Thani!"), "Fatima-Al Thani");
  assert.equal(sanitizePersonName("@@@"), "Customer");
});

test("HMAC includes only non-empty signed fields in SkipCash order", () => {
  const combined = combineSignedFields(
    {
      Uid: "u1",
      KeyId: "k1",
      Amount: "10.00",
      FirstName: "Ada",
      LastName: "Lovelace",
      Phone: "+97455512345",
      Email: "ada@clicks.qa",
      TransactionId: "job1",
      Custom1: "abc",
      Description: "ignored",
    },
    PAYMENT_SIGN_KEYS
  );
  assert.equal(
    combined,
    "Uid=u1,KeyId=k1,Amount=10.00,FirstName=Ada,LastName=Lovelace,Phone=+97455512345,Email=ada@clicks.qa,TransactionId=job1,Custom1=abc"
  );
});

test("payment and webhook signatures are stable HMAC-SHA256 base64", () => {
  const secret = "test-secret";
  const paymentSig = signPaymentPayload(
    {
      Uid: "uid",
      KeyId: "key",
      Amount: "1.00",
      FirstName: "A",
      LastName: "B",
      Phone: "+97450000000",
      Email: "a@clicks.qa",
    },
    secret
  );
  assert.match(paymentSig, /^[A-Za-z0-9+/=]+$/);
  assert.equal(
    paymentSig,
    signPaymentPayload(
      {
        Uid: "uid",
        KeyId: "key",
        Amount: "1.00",
        FirstName: "A",
        LastName: "B",
        Phone: "+97450000000",
        Email: "a@clicks.qa",
      },
      secret
    )
  );

  const webhook = {
    PaymentId: "pay-1",
    Amount: "1.00",
    StatusId: 2,
    TransactionId: "tx-1",
    Custom1: "job-1",
    VisaId: "visa-1",
  };
  const webhookSig = signWebhookPayload(webhook, secret);
  assert.equal(verifyWebhookSignature(webhook, webhookSig, secret), true);
  assert.equal(verifyWebhookSignature(webhook, "nope", secret), false);
});

test("status helpers match SkipCash statusId values", () => {
  assert.equal(isPaidStatus(2), true);
  assert.equal(isPaidStatus("2"), true);
  assert.equal(isPaidStatus(0), false);
  assert.equal(isReusableStatus(0), true);
  assert.equal(isReusableStatus(12), true);
  assert.equal(isReusableStatus(3), false);
});

test("transaction ids stay within SkipCash limits", () => {
  const id = buildTransactionId("507f1f77bcf86cd799439011");
  assert.ok(id.length <= 40);
  assert.match(id, /^[a-zA-Z0-9]+$/);
});

test("config is disabled without merchant keys", () => {
  const cfg = getSkipcashConfig({
    SKIPCASH_KEY_ID: "",
    SKIPCASH_KEY_SECRET: "",
    SKIPCASH_CLIENT_ID: "",
  });
  assert.equal(cfg.enabled, false);
  assert.equal(skipcashBaseUrl("sandbox"), SANDBOX_BASE_URL);
  assert.equal(skipcashBaseUrl("production"), PRODUCTION_BASE_URL);
});

test("config enables when all three keys are present", () => {
  const cfg = getSkipcashConfig({
    SKIPCASH_KEY_ID: "key-id",
    SKIPCASH_KEY_SECRET: "secret",
    SKIPCASH_CLIENT_ID: "client",
    SKIPCASH_ENV: "production",
  });
  assert.equal(cfg.enabled, true);
  assert.equal(cfg.baseUrl, PRODUCTION_BASE_URL);
});
