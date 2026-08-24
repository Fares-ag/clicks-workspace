const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { durationEnv } = require("./durationEnv");

const NAME = "TEST_DURATION_ENV_MS";

describe("durationEnv", () => {
  const originalError = console.error;

  beforeEach(() => {
    delete process.env[NAME];
    console.error = () => {}; // the invalid-value path logs on purpose
  });

  afterEach(() => {
    delete process.env[NAME];
    console.error = originalError;
  });

  it("uses the fallback when unset or blank", () => {
    assert.equal(durationEnv(NAME, 60000), 60000);
    process.env[NAME] = "";
    assert.equal(durationEnv(NAME, 60000), 60000);
    process.env[NAME] = "   ";
    assert.equal(durationEnv(NAME, 60000), 60000);
  });

  it("returns the fallback instead of NaN for a non-numeric value", () => {
    // The bug this exists to prevent: NaN propagates into `age >= NaN`, which
    // is always false, marking every technician permanently fresh.
    for (const bad of ["60s", "true", "abc", '"60000"', "1e", "{}"]) {
      process.env[NAME] = bad;
      const value = durationEnv(NAME, 60000);
      assert.ok(Number.isFinite(value), `expected finite for ${bad}`);
      assert.equal(value, 60000, `expected fallback for ${bad}`);
    }
  });

  it("rejects zero and negative values rather than disabling the window", () => {
    process.env[NAME] = "0";
    assert.equal(durationEnv(NAME, 60000), 60000);
    process.env[NAME] = "-5000";
    assert.equal(durationEnv(NAME, 60000), 60000);
  });

  it("honours a valid override", () => {
    process.env[NAME] = "30000";
    assert.equal(durationEnv(NAME, 60000), 30000);
    process.env[NAME] = " 45000 ";
    assert.equal(durationEnv(NAME, 60000), 45000);
  });
});
