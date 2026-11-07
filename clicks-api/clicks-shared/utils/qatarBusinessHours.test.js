const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isOpenAt,
  stampBusinessHours,
  nextOpenAt,
} = require("./qatarBusinessHours");

function qatarLocal(year, month, day, hour, minute = 0) {
  return new Date(Date.UTC(year, month - 1, day, hour - 3, minute));
}

test("midday Qatar is open", () => {
  assert.equal(isOpenAt(qatarLocal(2026, 10, 31, 12, 0)), true);
  assert.equal(stampBusinessHours(qatarLocal(2026, 10, 31, 12, 0)).after_hours, false);
});

test("2am Qatar is after hours and has a next_open_at", () => {
  const at = qatarLocal(2026, 10, 31, 2, 0);
  assert.equal(isOpenAt(at), false);
  const stamp = stampBusinessHours(at);
  assert.equal(stamp.after_hours, true);
  assert.ok(stamp.next_open_at instanceof Date);
  assert.equal(nextOpenAt(at).toISOString(), stamp.next_open_at.toISOString());
});
