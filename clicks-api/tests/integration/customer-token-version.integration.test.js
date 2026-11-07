/**
 * WS-F item 3 (scenarios 12, 13): token_version revocation + sliding refresh.
 */
const request = require("supertest");
const jwt = require("../../clicks-admin-api/node_modules/jsonwebtoken");
const { Customer } = require("../../clicks-shared/models");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const { seedCustomer, seedOtpRecord } = require("../helpers/seed");
const { customerToken, bearer } = require("../helpers/tokens");

const DAY = 24 * 60 * 60;
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

function signRaw(payload, opts) {
  return jwt.sign(payload, process.env.JWT_SECRET, opts);
}

async function login(phone, password = "password123") {
  const res = await request(techApp).post("/api/customers/login").send({ phone_number: phone, password });
  expect(res.status).toBe(200);
  return res.body.token;
}

describe("token_version revocation", () => {
  test("login token carries tv and works", async () => {
    const customer = await seedCustomer();
    const token = await login(customer.phone_number);
    expect(jwt.decode(token).tv).toBe(0);
    const res = await request(techApp).get("/api/customers/profile").set(bearer(token));
    expect(res.status).toBe(200);
  });

  test("legacy tokens without tv keep working until the first bump", async () => {
    const customer = await seedCustomer();
    const res = await request(techApp)
      .get("/api/customers/profile")
      .set(bearer(customerToken(customer._id)));
    expect(res.status).toBe(200);
  });

  test("password reset invalidates the old token", async () => {
    const customer = await seedCustomer({ phone_number: "+97455577001" });
    const oldToken = await login(customer.phone_number);

    await seedOtpRecord({ phone: "+97455577001", otp: "246810", purpose: "password_reset", verified: true });
    const reset = await request(techApp).post("/api/customers/reset-password").send({
      phone_number: "+97455577001",
      otp: "246810",
      new_password: "brand-new-pass",
      confirm_password: "brand-new-pass",
    });
    expect(reset.status).toBe(200);

    const stale = await request(techApp).get("/api/customers/profile").set(bearer(oldToken));
    expect(stale.status).toBe(401);
    expect(stale.body.code).toBe("TOKEN_REVOKED");

    const fresh = await login(customer.phone_number, "brand-new-pass");
    const ok = await request(techApp).get("/api/customers/profile").set(bearer(fresh));
    expect(ok.status).toBe(200);
  });

  test("password change revokes other sessions but returns a token for this one", async () => {
    const customer = await seedCustomer();
    const deviceA = await login(customer.phone_number);
    const deviceB = await login(customer.phone_number);
    const res = await request(techApp)
      .post("/api/customers/update-password")
      .set(bearer(deviceA))
      .send({ oldPassword: "password123", newPassword: "another-pass-1" });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();

    expect((await request(techApp).get("/api/customers/profile").set(bearer(deviceB))).status).toBe(401);
    expect((await request(techApp).get("/api/customers/profile").set(bearer(res.body.token))).status).toBe(200);
  });

  test("logout-all revokes every other token", async () => {
    const customer = await seedCustomer();
    const deviceA = await login(customer.phone_number);
    const deviceB = await login(customer.phone_number);
    const res = await request(techApp).post("/api/customers/logout-all").set(bearer(deviceA));
    expect(res.status).toBe(200);
    expect((await request(techApp).get("/api/customers/profile").set(bearer(deviceB))).status).toBe(401);
    expect((await request(techApp).get("/api/customers/profile").set(bearer(res.body.token))).status).toBe(200);
  });

  test("expired token is 401 TOKEN_EXPIRED (not a generic error)", async () => {
    const customer = await seedCustomer();
    const expired = signRaw({ id: String(customer._id), role: "customer", tv: 0, exp: Math.floor(Date.now() / 1000) - 60 });
    const res = await request(techApp).get("/api/customers/profile").set(bearer(expired));
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("TOKEN_EXPIRED");
  });
});

describe("POST /api/customers/token/refresh", () => {
  test("a fresh token is returned unchanged", async () => {
    const customer = await seedCustomer();
    const token = await login(customer.phone_number);
    const res = await request(techApp).post("/api/customers/token/refresh").set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.refreshed).toBe(false);
    expect(res.body.token).toBe(token);
  });

  test("a token with < 3 days left is renewed", async () => {
    const customer = await seedCustomer();
    const nearExpiry = signRaw({ id: String(customer._id), role: "customer", tv: 0 }, { expiresIn: DAY });
    const res = await request(techApp).post("/api/customers/token/refresh").set(bearer(nearExpiry));
    expect(res.status).toBe(200);
    expect(res.body.refreshed).toBe(true);
    const decoded = jwt.decode(res.body.token);
    expect(decoded.exp - Math.floor(Date.now() / 1000)).toBeGreaterThan(6 * DAY);
    expect((await request(techApp).get("/api/customers/profile").set(bearer(res.body.token))).status).toBe(200);
  });

  test("a token that expired within the grace window is renewed (never logged out mid-job)", async () => {
    const customer = await seedCustomer();
    const expired = signRaw({
      id: String(customer._id),
      role: "customer",
      tv: 0,
      exp: Math.floor(Date.now() / 1000) - 2 * DAY,
    });
    const res = await request(techApp).post("/api/customers/token/refresh").set(bearer(expired));
    expect(res.status).toBe(200);
    expect(res.body.refreshed).toBe(true);
  });

  test("past the grace window, a revoked token, or a blocked account cannot refresh", async () => {
    const customer = await seedCustomer();
    const ancient = signRaw({
      id: String(customer._id),
      role: "customer",
      tv: 0,
      exp: Math.floor(Date.now() / 1000) - 30 * DAY,
    });
    const tooOld = await request(techApp).post("/api/customers/token/refresh").set(bearer(ancient));
    expect(tooOld.status).toBe(401);

    const token = await login(customer.phone_number);
    await Customer.updateOne({ _id: customer._id }, { $inc: { token_version: 1 } });
    const revoked = await request(techApp).post("/api/customers/token/refresh").set(bearer(token));
    expect(revoked.status).toBe(401);
    expect(revoked.body.code).toBe("TOKEN_REVOKED");

    await Customer.updateOne({ _id: customer._id }, { $set: { status: "Inactive" } });
    const fresh = signRaw({ id: String(customer._id), role: "customer", tv: 1 }, { expiresIn: DAY });
    const blocked = await request(techApp).post("/api/customers/token/refresh").set(bearer(fresh));
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe("ACCOUNT_INACTIVE");
  });

  test("a technician token cannot be refreshed as a customer", async () => {
    const tech = signRaw({ id: "507f1f77bcf86cd799439099", role: "technician" }, { expiresIn: DAY });
    const res = await request(techApp).post("/api/customers/token/refresh").set(bearer(tech));
    expect(res.status).toBe(401);
  });
});
