/**
 * WS-I item 2 + WS-F item 6 (scenarios 19, 27, 41): /api/config/public and
 * the server-side minimum-version backstop.
 */
const request = require("supertest");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const { seedCustomer } = require("../helpers/seed");
const { customerToken, bearer } = require("../helpers/tokens");
const { compareVersions } = require("../../clicks-customer-tech-api/src/utils/appVersion");

let techApp;
const ENV_KEYS = ["SUPPORT_PHONE", "MIN_APP_VERSION_IOS", "MIN_APP_VERSION_ANDROID", "APP_STORE_URL_ANDROID"];
const saved = {};

beforeAll(async () => {
  await connectTestDb();
  ({ app: techApp } = require("../../clicks-customer-tech-api/src/createApp").createTechApp());
});

afterAll(async () => {
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearCollections();
  for (const k of ENV_KEYS) saved[k] = process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

test("returns flags, min versions, support phone and coverage without auth", async () => {
  process.env.SUPPORT_PHONE = "+97470000000";
  process.env.MIN_APP_VERSION_IOS = "1.2.0";
  process.env.MIN_APP_VERSION_ANDROID = "1.1.0";
  const res = await request(techApp).get("/api/config/public");
  expect(res.status).toBe(200);
  expect(res.body.flags).toEqual(
    expect.objectContaining({ public_sos: true, public_signup: true, customer_membership: true })
  );
  expect(res.body.min_app_version).toEqual({ ios: "1.2.0", android: "1.1.0" });
  expect(res.body.support_phone).toBe("+97470000000");
  expect(res.body.coverage.country).toBe("QA");
  expect(res.body.coverage.bounds).toEqual(
    expect.objectContaining({ minLat: expect.any(Number), maxLng: expect.any(Number) })
  );
  expect(res.body.otp_allowed_prefixes).toEqual(["+974"]);
  expect(res.body.dispatch_hours).toBe("24/7");
});

test("support_phone is null when unset (app uses its fallback constant)", async () => {
  delete process.env.SUPPORT_PHONE;
  const res = await request(techApp).get("/api/config/public");
  expect(res.body.support_phone).toBeNull();
});

describe("minimum app version gate", () => {
  test("an outdated client gets 426 APP_UPDATE_REQUIRED", async () => {
    process.env.MIN_APP_VERSION_ANDROID = "1.3.0";
    process.env.APP_STORE_URL_ANDROID = "https://play.google.com/store/apps/details?id=x";
    const customer = await seedCustomer();
    const res = await request(techApp)
      .get("/api/customers/profile")
      .set(bearer(customerToken(customer._id)))
      .set("X-App-Version", "1.2.9")
      .set("X-Platform", "android");
    expect(res.status).toBe(426);
    expect(res.body.code).toBe("APP_UPDATE_REQUIRED");
    expect(res.body.store_url).toMatch(/play\.google/);
  });

  test("current clients, other platforms, and header-less callers pass", async () => {
    process.env.MIN_APP_VERSION_ANDROID = "1.3.0";
    const customer = await seedCustomer();
    const auth = bearer(customerToken(customer._id));
    const current = await request(techApp)
      .get("/api/customers/profile")
      .set(auth)
      .set("X-App-Version", "1.3.0+42")
      .set("X-Platform", "android");
    expect(current.status).toBe(200);
    const ios = await request(techApp)
      .get("/api/customers/profile")
      .set(auth)
      .set("X-App-Version", "0.1.0")
      .set("X-Platform", "ios");
    expect(ios.status).toBe(200);
    expect((await request(techApp).get("/api/customers/profile").set(auth)).status).toBe(200);
  });

  test("the config endpoint itself is never gated", async () => {
    process.env.MIN_APP_VERSION_ANDROID = "9.0.0";
    const res = await request(techApp)
      .get("/api/config/public")
      .set("X-App-Version", "1.0.0")
      .set("X-Platform", "android");
    expect(res.status).toBe(200);
  });

  test("version comparison", () => {
    expect(compareVersions("1.2.10", "1.2.9")).toBe(1);
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
    expect(compareVersions("1.0.0+5", "1.0.1")).toBe(-1);
    expect(compareVersions("garbage", "1.0.0")).toBeNull();
  });
});
