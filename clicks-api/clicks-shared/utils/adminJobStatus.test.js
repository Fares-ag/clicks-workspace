const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  buildAdminJobStatusPayload,
  notifyAdminJobStatusFromReq,
} = require("./adminJobStatus");

describe("buildAdminJobStatusPayload", () => {
  it("returns null without a job id or status", () => {
    assert.equal(buildAdminJobStatusPayload(null), null);
    assert.equal(buildAdminJobStatusPayload({ job_status: "en_route" }), null);
    assert.equal(buildAdminJobStatusPayload({ _id: "abc" }), null);
  });

  it("normalizes ids and timestamps for admin sockets", () => {
    const enRouteAt = new Date("2026-10-15T05:00:00.000Z");
    const payload = buildAdminJobStatusPayload({
      _id: { toString: () => "job1" },
      job_status: "en_route",
      job_reference: "CK-100",
      clientName: "Sara",
      assignedTechnician: { _id: "tech9" },
      en_route_at: enRouteAt,
    });
    assert.deepEqual(payload, {
      job_id: "job1",
      status: "en_route",
      job_reference: "CK-100",
      clientName: "Sara",
      technician_id: "tech9",
      assigned_at: undefined,
      accepted_at: undefined,
      en_route_at: enRouteAt,
      arrived_at: undefined,
      started_at: undefined,
    });
  });
});

describe("notifyAdminJobStatusFromReq", () => {
  it("no-ops when the notify hook is missing", () => {
    assert.equal(
      notifyAdminJobStatusFromReq(
        { app: { get: () => undefined } },
        { _id: "job1", job_status: "en_route" }
      ),
      false
    );
  });

  it("calls notifyAdminJobStatus with the built payload", () => {
    const calls = [];
    const req = {
      app: {
        get: (key) => (key === "notifyAdminJobStatus" ? (p) => calls.push(p) : null),
      },
    };
    const ok = notifyAdminJobStatusFromReq(req, {
      _id: "job1",
      job_status: "en_route",
      assignedTechnician: "tech9",
    });
    assert.equal(ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].job_id, "job1");
    assert.equal(calls[0].status, "en_route");
    assert.equal(calls[0].technician_id, "tech9");
  });
});
