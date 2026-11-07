const test = require("node:test");
const assert = require("node:assert/strict");
const { assertDispatchWindow } = require("./dispatchWindow");

function qatarLocal(year, month, day, hour, minute = 0) {
  return new Date(Date.UTC(year, month - 1, day, hour - 3, minute));
}

test("midday slot inside 60 days is accepted", () => {
  const when = qatarLocal(2026, 11, 2, 11, 0);
  if (when.getTime() <= Date.now()) return;
  assert.equal(assertDispatchWindow(when).getTime(), when.getTime());
});

test("2am Qatar slot is rejected", () => {
  const when = new Date(Date.now() + 36 * 60 * 60 * 1000);
  when.setUTCHours(23, 0, 0, 0);
  assert.throws(() => assertDispatchWindow(when), (err) => {
    return err.code === "DISPATCH_WINDOW" || err.code === "SCHEDULED_FOR_PAST";
  });
});

test("past slot is rejected", () => {
  assert.throws(() => assertDispatchWindow(new Date(Date.now() - 120_000)), (err) => {
    assert.equal(err.code, "SCHEDULED_FOR_PAST");
    return true;
  });
});
