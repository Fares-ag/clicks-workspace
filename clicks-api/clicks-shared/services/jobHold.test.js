const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  validateHoldReason,
  parseScheduledReturnAt,
  HOLD_REASON_MAX,
} = require("./jobHold");

describe("validateHoldReason", () => {
  it("rejects missing, empty, and whitespace-only reasons", () => {
    for (const value of [undefined, null, "", "   ", "\n\t"]) {
      assert.throws(() => validateHoldReason(value), {
        message: "Hold reason is required",
        status: 400,
      });
    }
  });

  it("trims a valid reason", () => {
    assert.equal(validateHoldReason("  Sent to garage  "), "Sent to garage");
  });

  it("rejects reasons over 2000 characters", () => {
    assert.throws(() => validateHoldReason("x".repeat(HOLD_REASON_MAX + 1)), {
      status: 400,
    });
  });
});

describe("parseScheduledReturnAt", () => {
  it("returns null for empty values", () => {
    assert.equal(parseScheduledReturnAt(null), null);
    assert.equal(parseScheduledReturnAt(""), null);
  });

  it("parses an ISO date", () => {
    const d = parseScheduledReturnAt("2026-09-04T10:00:00.000Z");
    assert.ok(d instanceof Date);
    assert.equal(d.toISOString(), "2026-09-04T10:00:00.000Z");
  });

  it("rejects invalid dates", () => {
    assert.throws(() => parseScheduledReturnAt("not-a-date"), {
      message: "Invalid scheduled return date",
      status: 400,
    });
  });
});
