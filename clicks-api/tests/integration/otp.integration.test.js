const request = require("supertest");
const { OTPVerification, Customer } = require("../../clicks-shared/models");
const OtpSendLog = require("../../clicks-shared/models/OtpSendLog");
const { sendSMS } = require("../../clicks-customer-tech-api/src/services/smsService");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const { seedOtpRecord, seedCustomer } = require("../helpers/seed");

const GENERIC_ERROR = "Invalid or expired code";
const PHONE = "+97455512345";

let techApp;

beforeAll(async () => {
  await connectTestDb();
  ({ app: techApp } = require("../../clicks-customer-tech-api/src/createApp").createTechApp());
});

afterAll(async () => {
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearCollections();
  sendSMS.mockClear();
});

describe("OTP security (request → verify flow)", () => {
  test("wrong code increments attempts and returns generic error", async () => {
    await seedOtpRecord({ phone: PHONE, otp: "483920", purpose: "registration" });

    const res = await request(techApp)
      .post("/api/customers/otp/verify")
      .send({ phone_number: PHONE, otp: "000000" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe(GENERIC_ERROR);

    const record = await OTPVerification.findOne({ phone: PHONE, purpose: "registration" });
    expect(record.attempts).toBe(1);
  });

  test("6th wrong attempt returns 429 and deletes the OTP record", async () => {
    await seedOtpRecord({ phone: PHONE, otp: "483920", purpose: "registration" });

    let lastStatus = null;
    for (let i = 0; i < 6; i++) {
      const res = await request(techApp)
        .post("/api/customers/otp/verify")
        .send({ phone_number: PHONE, otp: "111111" });
      lastStatus = res.status;
      if (i < 5) {
        expect(res.status).toBe(400);
        expect(res.body.error).toBe(GENERIC_ERROR);
      }
    }

    expect(lastStatus).toBe(429);
    expect(await OTPVerification.countDocuments({ phone: PHONE })).toBe(0);
  });

  test('Mongo operator payload {"otp":{"$gt":""}} is rejected and never matches', async () => {
    await seedOtpRecord({ phone: PHONE, otp: "483920", purpose: "registration" });

    const res = await request(techApp)
      .post("/api/customers/otp/verify")
      .send({ phone_number: PHONE, otp: { $gt: "" } });

    expect(res.status).toBe(400);
    // Sanitize reject mode or otpVerify — either blocks operator injection.
    expect([GENERIC_ERROR, "Malformed request payload"]).toContain(res.body.error);

    const record = await OTPVerification.findOne({ phone: PHONE, purpose: "registration" });
    expect(record).not.toBeNull();
    expect(record.verified).toBe(false);
  });

  test("request OTP → verify with correct code succeeds", async () => {
    const phone = "+97455599999";

    const sendRes = await request(techApp)
      .post("/api/customers/otp/send")
      .send({ phone_number: phone });
    expect(sendRes.status).toBe(200);

    const stored = await OTPVerification.findOne({ phone, purpose: "registration" });
    expect(stored).not.toBeNull();

    const verifyRes = await request(techApp)
      .post("/api/customers/otp/verify")
      .send({ phone_number: phone, otp: stored.otp });
    expect(verifyRes.status).toBe(200);

    const updated = await OTPVerification.findById(stored._id);
    expect(updated.verified).toBe(true);
  });
});

async function sendAndVerify(phone) {
  const sendRes = await request(techApp).post("/api/customers/otp/send").send({ phone_number: phone });
  expect(sendRes.status).toBe(200);
  const stored = await OTPVerification.findOne({ phone, purpose: "registration" });
  const verifyRes = await request(techApp)
    .post("/api/customers/otp/verify")
    .send({ phone_number: phone, otp: stored.otp });
  expect(verifyRes.status).toBe(200);
  return stored.otp;
}

function registerBody(phone, otp, overrides = {}) {
  return {
    phone_number: phone,
    first_name: "Ali",
    last_name: "Al",
    email: `ali.${phone.slice(-4)}@example.com`,
    password: "password123",
    otp,
    ...overrides,
  };
}

describe("Registration (QW 1, 2, 8)", () => {
  test("register with the verified otp succeeds", async () => {
    const phone = "+97455500101";
    const otp = await sendAndVerify(phone);
    const res = await request(techApp).post("/api/customers/register").send(registerBody(phone, otp));
    expect(res.status).toBe(201);
    expect(res.body.restored).toBe(false);
    const customer = await Customer.findOne({ phone_number: phone });
    expect(customer).not.toBeNull();
    // Two-letter last name is valid under the shared name rule (S17).
    expect(customer.last_name).toBe("Al");
    expect(await OTPVerification.countDocuments({ phone, purpose: "registration" })).toBe(0);
  });

  test("register without otp is refused", async () => {
    const phone = "+97455500102";
    await sendAndVerify(phone);
    const res = await request(techApp)
      .post("/api/customers/register")
      .send(registerBody(phone, undefined));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("REGISTRATION_OTP_REQUIRED");
    expect(await Customer.countDocuments({ phone_number: phone })).toBe(0);
  });

  test("double-tap register returns 409, never 500", async () => {
    const phone = "+97455500103";
    const otp = await sendAndVerify(phone);
    const [a, b] = await Promise.all([
      request(techApp).post("/api/customers/register").send(registerBody(phone, otp)),
      request(techApp).post("/api/customers/register").send(registerBody(phone, otp)),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses[0]).toBe(201);
    expect([400, 409]).toContain(statuses[1]);
    expect(JSON.stringify([a.body, b.body])).not.toMatch(/E11000|details/);
    expect(await Customer.countDocuments({ phone_number: phone })).toBe(1);
  });

  test("email is lower-cased and a case-variant duplicate is 409", async () => {
    const phone1 = "+97455500104";
    const otp1 = await sendAndVerify(phone1);
    const first = await request(techApp)
      .post("/api/customers/register")
      .send(registerBody(phone1, otp1, { email: "  Ali@Example.COM " }));
    expect(first.status).toBe(201);
    expect((await Customer.findOne({ phone_number: phone1 })).email).toBe("ali@example.com");

    const phone2 = "+97455500105";
    const otp2 = await sendAndVerify(phone2);
    const second = await request(techApp)
      .post("/api/customers/register")
      .send(registerBody(phone2, otp2, { email: "ali@example.com" }));
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("EMAIL_ALREADY_REGISTERED");
  });

  test("names outside the shared rule are 400, not a schema 500", async () => {
    const phone = "+97455500106";
    const otp = await sendAndVerify(phone);
    const res = await request(techApp)
      .post("/api/customers/register")
      .send(registerBody(phone, otp, { first_name: "x".repeat(60) }));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_FIRST_NAME");
  });
});

describe("Password reset goes to the stored number (WS-F 1, scenario 6)", () => {
  const QATAR = "+97455512345";
  const FOREIGN_SAME_SUFFIX = "+4455512345";

  test("a foreign number with the same last 8 digits is refused", async () => {
    await seedCustomer({ phone_number: QATAR });
    const res = await request(techApp)
      .post("/api/customers/forgot-password")
      .send({ phone_number: FOREIGN_SAME_SUFFIX });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("PHONE_COUNTRY_NOT_SUPPORTED");
    expect(await OTPVerification.countDocuments({ purpose: "password_reset" })).toBe(0);
    expect(sendSMS).not.toHaveBeenCalled();
  });

  test("even with the prefix allowed, the suffix never matches the Qatar account", async () => {
    process.env.OTP_ALLOWED_PREFIXES = "+974,+44";
    try {
      const victim = await seedCustomer({ phone_number: QATAR });
      const res = await request(techApp)
        .post("/api/customers/forgot-password")
        .send({ phone_number: FOREIGN_SAME_SUFFIX });
      expect(res.status).toBe(200);
      expect(await OTPVerification.countDocuments({ purpose: "password_reset" })).toBe(0);
      expect(sendSMS).not.toHaveBeenCalled();

      // A code the attacker holds for their own number cannot reset the victim.
      await seedOtpRecord({ phone: FOREIGN_SAME_SUFFIX, otp: "111222", purpose: "password_reset", verified: true });
      const reset = await request(techApp).post("/api/customers/reset-password").send({
        phone_number: FOREIGN_SAME_SUFFIX,
        otp: "111222",
        new_password: "attacker-pass-1",
        confirm_password: "attacker-pass-1",
      });
      expect(reset.status).toBe(400);
      const after = await Customer.findById(victim._id).select("+password");
      expect(after.password).toBe(victim.password);
    } finally {
      delete process.env.OTP_ALLOWED_PREFIXES;
    }
  });

  test("the OTP is sent to the account's stored number, not the raw input", async () => {
    // Legacy row stored as 8 local digits.
    await seedCustomer({ phone_number: "55512399" });
    const res = await request(techApp)
      .post("/api/customers/forgot-password")
      .send({ phone_number: "+974 5551 2399" });
    expect(res.status).toBe(200);
    expect(sendSMS).toHaveBeenCalledTimes(1);
    expect(sendSMS.mock.calls[0][0]).toBe("+97455512399");
    const rec = await OTPVerification.findOne({ purpose: "password_reset" });
    expect(rec.phone).toBe("+97455512399");

    const verify = await request(techApp)
      .post("/api/customers/verify-reset-otp")
      .send({ phone_number: "55512399", otp: rec.otp });
    expect(verify.status).toBe(200);
    const reset = await request(techApp).post("/api/customers/reset-password").send({
      phone_number: "55512399",
      otp: rec.otp,
      new_password: "new-password-1",
      confirm_password: "new-password-1",
    });
    expect(reset.status).toBe(200);
  });
});

describe("OTP send caps and country allowlist (WS-F 2, scenario 11)", () => {
  test("per-phone cap: the 4th send within an hour is 429", async () => {
    const phone = "+97455500201";
    for (let i = 0; i < 3; i += 1) {
      const ok = await request(techApp).post("/api/customers/otp/send").send({ phone_number: phone });
      expect(ok.status).toBe(200);
    }
    const capped = await request(techApp)
      .post("/api/customers/otp/send")
      .send({ phone_number: "55500201" }); // same number, local format
    expect(capped.status).toBe(429);
    expect(capped.body.code).toBe("OTP_SEND_LIMIT");
    expect(sendSMS).toHaveBeenCalledTimes(3);
  });

  test("forgot-password shares the per-phone cap", async () => {
    const phone = "+97455500202";
    await seedCustomer({ phone_number: phone });
    for (let i = 0; i < 3; i += 1) {
      const ok = await request(techApp).post("/api/customers/forgot-password").send({ phone_number: phone });
      expect(ok.status).toBe(200);
    }
    const capped = await request(techApp).post("/api/customers/forgot-password").send({ phone_number: phone });
    expect(capped.status).toBe(429);
  });

  test("daily cap applies beyond the hourly window", async () => {
    const phone = "+97455500203";
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await OtpSendLog.insertMany(
      Array.from({ length: 10 }, () => ({ phone, purpose: "registration", created_at: old }))
    );
    const res = await request(techApp).post("/api/customers/otp/send").send({ phone_number: phone });
    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/today/);
  });

  test("non-+974 numbers are refused before any SMS", async () => {
    const res = await request(techApp)
      .post("/api/customers/otp/send")
      .send({ phone_number: "+447700900123" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("PHONE_COUNTRY_NOT_SUPPORTED");
    expect(sendSMS).not.toHaveBeenCalled();
    expect(await OTPVerification.countDocuments({})).toBe(0);
  });
});

describe("SMSala response parsing (scenario 9)", () => {
  const { smsalaBodyError } = jest.requireActual(
    "../../clicks-customer-tech-api/src/services/smsService"
  );

  test("success bodies pass", () => {
    expect(smsalaBodyError({ Status: "Success", MessageId: "1" })).toBeNull();
    expect(smsalaBodyError([{ status: "success" }])).toBeNull();
  });

  test("a 2xx body reporting an error is a failure", () => {
    expect(smsalaBodyError({ Status: "Failed", Message: "Insufficient balance" })).toMatch(/Insufficient/);
    expect(smsalaBodyError([{ Status: "Error", StatusDescription: "Invalid sender" }])).toMatch(/Invalid sender/);
    expect(smsalaBodyError({ ErrorCode: 104, Message: "bad number" })).toMatch(/104/);
    expect(smsalaBodyError("Invalid apiToken")).toMatch(/Invalid/);
    expect(smsalaBodyError("")).toMatch(/empty/);
  });

  test("production refuses SMS_PROVIDER=console at send time", async () => {
    const { sendSMS: realSend } = jest.requireActual(
      "../../clicks-customer-tech-api/src/services/smsService"
    );
    const prev = { env: process.env.NODE_ENV, provider: process.env.SMS_PROVIDER };
    process.env.NODE_ENV = "production";
    process.env.SMS_PROVIDER = "console";
    try {
      await expect(realSend("+97455500000", "x")).rejects.toThrow(/console/);
    } finally {
      process.env.NODE_ENV = prev.env;
      process.env.SMS_PROVIDER = prev.provider;
    }
  });
});
