const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  JOB_STATUSES,
  TECH_BUSY_JOB_STATUSES,
  TECH_SESSION_ACTIVE_STATUSES,
  HOLDABLE_JOB_STATUSES,
  OFFLINE_BLOCKING_STATUSES,
  ONGOING_JOB_STATUSES,
  JOB_STATUS_PRIORITY,
} = require("./jobStatuses");

describe("jobStatuses", () => {
  it("includes on_hold in the canonical enum list", () => {
    assert.ok(JOB_STATUSES.includes("on_hold"));
  });

  it("does not treat on_hold as busy or offline-blocking", () => {
    assert.equal(TECH_BUSY_JOB_STATUSES.includes("on_hold"), false);
    assert.equal(OFFLINE_BLOCKING_STATUSES.includes("on_hold"), false);
    assert.equal(ONGOING_JOB_STATUSES.includes("on_hold"), false);
  });

  it("keeps held jobs in the technician session queue", () => {
    assert.ok(TECH_SESSION_ACTIVE_STATUSES.includes("on_hold"));
  });

  it("allows hold from accepted through in_progress", () => {
    assert.deepEqual(HOLDABLE_JOB_STATUSES, [
      "accepted",
      "en_route",
      "arrived",
      "in_progress",
    ]);
  });

  it("sorts on_hold below actionable fulfill statuses", () => {
    assert.ok(JOB_STATUS_PRIORITY.on_hold > JOB_STATUS_PRIORITY.accepted);
    assert.ok(JOB_STATUS_PRIORITY.on_hold > JOB_STATUS_PRIORITY.in_progress);
  });
});
