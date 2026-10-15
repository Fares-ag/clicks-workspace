const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  BACKGROUND_DISCONNECT_GRACE_MS,
  parseLifecycleState,
  classifyTechnicianDisconnect,
  disconnectActivityForDecision,
  applyTechnicianAppLifecycle,
} = require("./technicianAppLifecycle");

describe("parseLifecycleState", () => {
  it("accepts background and foreground", () => {
    assert.equal(parseLifecycleState("background"), "background");
    assert.equal(parseLifecycleState("Foreground"), "foreground");
  });

  it("rejects anything else", () => {
    assert.equal(parseLifecycleState(""), null);
    assert.equal(parseLifecycleState("closed"), null);
  });
});

describe("classifyTechnicianDisconnect", () => {
  const now = 1_000_000;

  it("keeps legacy App closed when the build never sent lifecycle events", () => {
    assert.equal(
      classifyTechnicianDisconnect({
        supportsLifecycle: false,
        backgrounded: false,
        reason: "ping timeout",
        now,
      }),
      "legacy_closed"
    );
  });

  it("treats an explicit client disconnect as App closed (logout)", () => {
    assert.equal(
      classifyTechnicianDisconnect({
        supportsLifecycle: true,
        backgrounded: false,
        reason: "io client disconnect",
        now,
      }),
      "legacy_closed"
    );
  });

  it("treats a foreground drop as force closed / crashed", () => {
    assert.equal(
      classifyTechnicianDisconnect({
        supportsLifecycle: true,
        backgrounded: false,
        reason: "ping timeout",
        now,
      }),
      "force_closed"
    );
  });

  it("skips the iOS socket drop that follows pause immediately", () => {
    assert.equal(
      classifyTechnicianDisconnect({
        supportsLifecycle: true,
        backgrounded: true,
        backgroundedAt: now - 1000,
        reason: "transport close",
        now,
      }),
      "skip"
    );
  });

  it("marks a later drop after background as closed while backgrounded", () => {
    assert.equal(
      classifyTechnicianDisconnect({
        supportsLifecycle: true,
        backgrounded: true,
        backgroundedAt: now - BACKGROUND_DISCONNECT_GRACE_MS - 1,
        reason: "transport close",
        now,
      }),
      "closed_in_background"
    );
  });
});

describe("disconnectActivityForDecision", () => {
  it("maps decisions to catalog events", () => {
    assert.equal(disconnectActivityForDecision("skip"), null);
    assert.equal(
      disconnectActivityForDecision("force_closed", "ping timeout").event,
      "session.app_force_closed"
    );
    assert.equal(
      disconnectActivityForDecision("closed_in_background", "transport close")
        .event,
      "session.app_closed_in_background"
    );
    assert.equal(
      disconnectActivityForDecision("legacy_closed").event,
      "session.app_closed"
    );
  });
});

describe("applyTechnicianAppLifecycle", () => {
  it("skips a duplicate same-state transition", async () => {
    const recorded = [];
    const Technician = {
      findById: () => ({
        select: () => ({
          lean: async () => ({
            lastAppLifecycle: "background",
            lastAppLifecycleAt: new Date(),
          }),
        }),
      }),
      updateOne: async () => {
        throw new Error("should not write");
      },
    };

    const result = await applyTechnicianAppLifecycle({
      Technician,
      technicianId: "t1",
      state: "background",
      recordTechnicianActivity: (entry) => recorded.push(entry),
    });

    assert.equal(result.ok, true);
    assert.equal(result.skipped, true);
    assert.equal(recorded.length, 0);
  });

  it("writes and logs a real transition", async () => {
    const recorded = [];
    const writes = [];
    const Technician = {
      findById: () => ({
        select: () => ({
          lean: async () => ({ lastAppLifecycle: "foreground" }),
        }),
      }),
      updateOne: async (filter, update) => {
        writes.push({ filter, update });
      },
    };

    const result = await applyTechnicianAppLifecycle({
      Technician,
      technicianId: "t1",
      state: "background",
      recordTechnicianActivity: (entry) => recorded.push(entry),
    });

    assert.equal(result.ok, true);
    assert.equal(writes[0].update.lastAppLifecycle, "background");
    assert.equal(writes[0].update.appLifecycleCapable, true);
    assert.equal(recorded[0].event, "session.app_backgrounded");
  });
});
