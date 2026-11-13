const test = require("node:test");
const assert = require("node:assert/strict");
const { busyPendingThreshold } = require("./sosBusy");

test("SOS_BUSY_PENDING unset or 0 disables busy mode", () => {
  const prev = process.env.SOS_BUSY_PENDING;
  delete process.env.SOS_BUSY_PENDING;
  assert.equal(busyPendingThreshold(), 0);
  process.env.SOS_BUSY_PENDING = "0";
  assert.equal(busyPendingThreshold(), 0);
  process.env.SOS_BUSY_PENDING = "20";
  assert.equal(busyPendingThreshold(), 20);
  if (prev == null) delete process.env.SOS_BUSY_PENDING;
  else process.env.SOS_BUSY_PENDING = prev;
});
