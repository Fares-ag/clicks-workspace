const request = require("supertest");
const { OTPVerification } = require("../../clicks-shared/models");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const { seedOtpRecord } = require("../helpers/seed");

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
