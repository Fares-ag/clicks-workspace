/**
 * WS-I item 1: the production config guard refuses each unsafe setting.
 * (Pure unit test — lives here because the jest config only runs this folder.)
 */
const {
  checkProductionConfig,
  assertProductionConfig,
} = require("../../clicks-shared/utils/assertProductionConfig");

const SAFE_TECH_ENV = {
  NODE_ENV: "production",
  LAUNCH_PUBLIC_SOS: "true",
  SKIPCASH_WEBHOOK_SECRET: "whsec",
  SMS_PROVIDER: "smsala",
  CORS_ORIGINS: "https://admin.clicks.qa",
  SINGLE_INSTANCE: "true",
  SENTRY_DSN: "https://sentry.example/1",
  SUPPORT_PHONE: "+97470000000",
};

const silent = { log: () => {}, warn: () => {} };

test("a complete production env passes with no warnings", () => {
  const r = checkProductionConfig(SAFE_TECH_ENV, { service: "tech" });
  expect(r.errors).toEqual([]);
  expect(r.warnings).toEqual([]);
  expect(() => assertProductionConfig({ env: SAFE_TECH_ENV, logger: silent })).not.toThrow();
});

test("non-production environments are never blocked", () => {
  const r = checkProductionConfig({ NODE_ENV: "development" }, { service: "tech" });
  expect(r.errors).toEqual([]);
});

test.each([
  ["LAUNCH_PUBLIC_SOS unset", { LAUNCH_PUBLIC_SOS: undefined }, /LAUNCH_PUBLIC_SOS/],
  ["LAUNCH_PUBLIC_SOS empty", { LAUNCH_PUBLIC_SOS: "" }, /LAUNCH_PUBLIC_SOS/],
  ["SKIPCASH_WEBHOOK_SECRET empty", { SKIPCASH_WEBHOOK_SECRET: " " }, /SKIPCASH_WEBHOOK_SECRET/],
  ["SMS_PROVIDER console", { SMS_PROVIDER: "console" }, /SMS_PROVIDER/],
  ["SMS_PROVIDER unset", { SMS_PROVIDER: undefined }, /SMS_PROVIDER/],
  ["CORS_ORIGINS empty", { CORS_ORIGINS: "" }, /CORS_ORIGINS/],
  ["no REDIS_URL and no SINGLE_INSTANCE", { SINGLE_INSTANCE: undefined }, /REDIS_URL/],
  ["SINGLE_INSTANCE=false without Redis", { SINGLE_INSTANCE: "false" }, /REDIS_URL/],
])("refuses to start when %s", (_label, override, pattern) => {
  const env = { ...SAFE_TECH_ENV, ...override };
  for (const [k, v] of Object.entries(override)) if (v === undefined) delete env[k];
  const r = checkProductionConfig(env, { service: "tech" });
  expect(r.errors.join("\n")).toMatch(pattern);
  expect(() => assertProductionConfig({ env, logger: silent })).toThrow(pattern);
});

test("REDIS_URL satisfies the single-instance rule", () => {
  const env = { ...SAFE_TECH_ENV, REDIS_URL: "redis://x:6379" };
  delete env.SINGLE_INSTANCE;
  expect(checkProductionConfig(env).errors).toEqual([]);
});

test("missing SENTRY_DSN only warns", () => {
  const env = { ...SAFE_TECH_ENV };
  delete env.SENTRY_DSN;
  const r = checkProductionConfig(env);
  expect(r.errors).toEqual([]);
  expect(r.warnings.join("\n")).toMatch(/SENTRY_DSN/);
});

test("admin service only needs CORS (CORS_ORIGINS or FRONTEND_URL)", () => {
  expect(checkProductionConfig({ NODE_ENV: "production", FRONTEND_URL: "https://a" }, { service: "admin" }).errors).toEqual([]);
  expect(checkProductionConfig({ NODE_ENV: "production" }, { service: "admin" }).errors.join()).toMatch(/CORS/);
});

test("every flag value is logged at boot", () => {
  const lines = [];
  assertProductionConfig({
    env: SAFE_TECH_ENV,
    logger: { log: (l) => lines.push(l), warn: () => {} },
  });
  const logged = JSON.parse(lines[0]);
  expect(logged.msg).toBe("launch_flags");
  expect(logged.flags.LAUNCH_PUBLIC_SOS).toBe("true");
  expect(logged.flags.LAUNCH_PUBLIC_SIGNUP).toBe("(unset)");
});
