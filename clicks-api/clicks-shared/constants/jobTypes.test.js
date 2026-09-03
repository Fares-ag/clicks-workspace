const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  JOB_TYPES,
  PREVIOUS_JOB_TYPES,
  LEGACY_JOB_TYPES,
  ALL_JOB_TYPES,
  TECHNICIAN_EXPERTISE,
} = require("./jobTypes");

describe("jobTypes TECHNICIAN_EXPERTISE", () => {
  it("includes all previous canonical expertise strings", () => {
    for (const value of PREVIOUS_JOB_TYPES) {
      assert.ok(
        TECHNICIAN_EXPERTISE.includes(value),
        `missing legacy expertise value: ${value}`
      );
    }
  });

  it("includes all legacy job type strings", () => {
    for (const value of LEGACY_JOB_TYPES) {
      assert.ok(
        TECHNICIAN_EXPERTISE.includes(value),
        `missing legacy job type in expertise: ${value}`
      );
    }
  });

  it("includes every new catalog job type", () => {
    for (const value of JOB_TYPES) {
      assert.ok(TECHNICIAN_EXPERTISE.includes(value));
    }
  });

  it("has no duplicate expertise values", () => {
    assert.equal(
      TECHNICIAN_EXPERTISE.length,
      new Set(TECHNICIAN_EXPERTISE).size
    );
  });

  it("matches ALL_JOB_TYPES coverage for technician expertise", () => {
    for (const value of ALL_JOB_TYPES) {
      assert.ok(
        TECHNICIAN_EXPERTISE.includes(value),
        `ALL_JOB_TYPES value missing from TECHNICIAN_EXPERTISE: ${value}`
      );
    }
  });
});
