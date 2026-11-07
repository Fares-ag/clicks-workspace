const test = require("node:test");
const assert = require("node:assert/strict");
const { customerCancelDecision } = require("./customerCancelPolicy");

test("assigned and accepted cancel free", () => {
  assert.deepEqual(customerCancelDecision("assigned"), {
    allowed: true,
    fee: false,
    code: "CANCEL_FREE",
  });
  assert.equal(customerCancelDecision("accepted").fee, false);
});

test("en_route and arrived cancel with a fee", () => {
  assert.equal(customerCancelDecision("en_route").fee, true);
  assert.equal(customerCancelDecision("arrived").allowed, true);
});

test("in_progress cannot be cancelled by the customer", () => {
  const d = customerCancelDecision("in_progress");
  assert.equal(d.allowed, false);
  assert.equal(d.code, "JOB_NOT_CANCELLABLE");
});
