const test = require("node:test");
const assert = require("node:assert/strict");
const { isInQatar, assertInQatar } = require("./qatarCoverage");

test("Doha seed pin is inside coverage", () => {
  assert.equal(isInQatar(25.2854, 51.531), true);
});

test("NYC pin is outside coverage", () => {
  assert.equal(isInQatar(40.7, -74), false);
  assert.throws(() => assertInQatar(40.7, -74), (err) => {
    assert.equal(err.status, 400);
    assert.equal(err.code, "OUTSIDE_COVERAGE");
    return true;
  });
});
