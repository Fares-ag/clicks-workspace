const test = require("node:test");
const assert = require("node:assert/strict");
const { assertCanResume } = require("./jobGarage");

test("generic resume is blocked while at garage", () => {
  assert.throws(
    () => assertCanResume({ garage: { phase: "at_garage" } }),
    (err) => /garage ready/i.test(err.message)
  );
});

test("generic resume is allowed without a garage phase", () => {
  assert.doesNotThrow(() => assertCanResume({ job_status: "on_hold" }));
});
