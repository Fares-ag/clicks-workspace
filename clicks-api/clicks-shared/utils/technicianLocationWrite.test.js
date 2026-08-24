const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const {
  applyTechnicianLocationWrite,
  parseCoordinatePair,
  resolveFixTime,
  resetTechnicianLocationWriteStateForTests,
  setLocationWriteStateForTests,
  MIN_MOVE_METERS,
} = require("./technicianLocationWrite");

const BASE_LAT = 25.3269467;
const BASE_LNG = 51.4883967;

function createMockTechnician(initial) {
  const docs = new Map();
  const defaultDoc = {
    currentLocation: initial
      ? { type: "Point", coordinates: [initial.lng, initial.lat] }
      : undefined,
    lastLocationAt: null,
  };

  return {
    seed(id, doc = defaultDoc) {
      docs.set(String(id), JSON.parse(JSON.stringify(doc)));
    },
    findById(id) {
      const key = String(id);
      return {
        select() {
          return this;
        },
        async lean() {
          const doc = docs.get(key);
          if (!doc) return null;
          return {
            currentLocation: doc.currentLocation,
          };
        },
      };
    },
    async findByIdAndUpdate(id, update) {
      const key = String(id);
      const doc = docs.get(key) || {
        currentLocation: undefined,
        lastLocationAt: null,
      };
      if (update["currentLocation.coordinates"]) {
        doc.currentLocation = {
          type: "Point",
          coordinates: update["currentLocation.coordinates"],
        };
      }
      if (update.lastLocationAt) {
        doc.lastLocationAt = update.lastLocationAt;
      }
      docs.set(key, doc);
      return doc;
    },
    get(id) {
      return docs.get(String(id));
    },
  };
}

describe("applyTechnicianLocationWrite", () => {
  beforeEach(() => {
    resetTechnicianLocationWriteStateForTests();
  });

  it("accepts first fix and broadcasts", async () => {
    const Technician = createMockTechnician();
    const broadcasts = [];
    const result = await applyTechnicianLocationWrite({
      Technician,
      technicianId: "tech1",
      latitude: BASE_LAT,
      longitude: BASE_LNG,
      onAdminBroadcast: (id, lat, lng, ts) => {
        broadcasts.push({ id, lat, lng, ts });
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.coordsChanged, true);
    assert.equal(broadcasts.length, 1);
    const stored = Technician.get("tech1");
    assert.deepEqual(stored.currentLocation.coordinates, [BASE_LNG, BASE_LAT]);
  });

  it(`rejects moves smaller than ${MIN_MOVE_METERS}m`, async () => {
    const Technician = createMockTechnician({ lat: BASE_LAT, lng: BASE_LNG });
    Technician.seed("tech1", {
      currentLocation: { type: "Point", coordinates: [BASE_LNG, BASE_LAT] },
      lastLocationAt: new Date(),
    });

    await applyTechnicianLocationWrite({
      Technician,
      technicianId: "tech1",
      latitude: BASE_LAT,
      longitude: BASE_LNG,
    });

    const broadcasts = [];
    const jitterLat = BASE_LAT + 0.00004; // ~4.4 m north
    const result = await applyTechnicianLocationWrite({
      Technician,
      technicianId: "tech1",
      latitude: jitterLat,
      longitude: BASE_LNG,
      onAdminBroadcast: () => broadcasts.push(1),
    });

    assert.equal(result.ok, false);
    assert.equal(result.reason, "min_move");
    assert.equal(broadcasts.length, 0);
    const stored = Technician.get("tech1");
    assert.equal(stored.currentLocation.coordinates[1], BASE_LAT);
  });

  it("accepts moves at or above minimum distance", async () => {
    const Technician = createMockTechnician({ lat: BASE_LAT, lng: BASE_LNG });
    Technician.seed("tech1", {
      currentLocation: { type: "Point", coordinates: [BASE_LNG, BASE_LAT] },
      lastLocationAt: new Date(),
    });

    await applyTechnicianLocationWrite({
      Technician,
      technicianId: "tech1",
      latitude: BASE_LAT,
      longitude: BASE_LNG,
    });

    const movedLat = BASE_LAT + 0.0002; // ~22 m north
    const broadcasts = [];
    const result = await applyTechnicianLocationWrite({
      Technician,
      technicianId: "tech1",
      latitude: movedLat,
      longitude: BASE_LNG,
      onAdminBroadcast: () => broadcasts.push(1),
    });

    assert.equal(result.ok, true);
    assert.equal(result.coordsChanged, true);
    assert.equal(broadcasts.length, 1);
    const stored = Technician.get("tech1");
    assert.ok(stored.currentLocation.coordinates[1] > BASE_LAT);
  });

  it("rejects poor accuracy when provided", async () => {
    const Technician = createMockTechnician();
    const result = await applyTechnicianLocationWrite({
      Technician,
      technicianId: "tech1",
      latitude: BASE_LAT,
      longitude: BASE_LNG,
      accuracy: 60,
    });

    assert.equal(result.ok, false);
    assert.equal(result.reason, "accuracy");
  });

  it("heartbeat refreshes timestamp without changing coordinates", async () => {
    const Technician = createMockTechnician();
    await applyTechnicianLocationWrite({
      Technician,
      technicianId: "tech1",
      latitude: BASE_LAT,
      longitude: BASE_LNG,
    });
    setLocationWriteStateForTests("tech1", { lastHeartbeatAt: 0 });

    const broadcasts = [];
    const result = await applyTechnicianLocationWrite({
      Technician,
      technicianId: "tech1",
      latitude: BASE_LAT,
      longitude: BASE_LNG,
      onAdminBroadcast: () => broadcasts.push(1),
    });

    assert.equal(result.ok, true);
    assert.equal(result.heartbeat, true);
    assert.equal(result.coordsChanged, false);
    assert.equal(broadcasts.length, 1);
    const stored = Technician.get("tech1");
    assert.deepEqual(stored.currentLocation.coordinates, [BASE_LNG, BASE_LAT]);
  });

  it("dedupes rapid coordinate changes via unified throttle", async () => {
    const Technician = createMockTechnician();
    const broadcasts = [];

    const first = await applyTechnicianLocationWrite({
      Technician,
      technicianId: "tech1",
      latitude: BASE_LAT,
      longitude: BASE_LNG,
      onAdminBroadcast: () => broadcasts.push(1),
    });
    assert.equal(first.ok, true);

    const second = await applyTechnicianLocationWrite({
      Technician,
      technicianId: "tech1",
      latitude: BASE_LAT + 0.0003,
      longitude: BASE_LNG,
      onAdminBroadcast: () => broadcasts.push(1),
    });

    assert.equal(second.ok, false);
    assert.equal(second.reason, "throttle");
    assert.equal(broadcasts.length, 1);
  });
});

describe("parseCoordinatePair", () => {
  it("rejects the values Number() silently maps to 0", () => {
    // Number(null) === Number("") === Number(false) === Number([]) === 0, and
    // 0,0 is a real point off West Africa — accepting any of these overwrites a
    // working technician's position with Null Island.
    for (const bad of [null, undefined, "", "   ", false, true, [], {}, NaN]) {
      assert.equal(parseCoordinatePair(bad, BASE_LNG), null, `lat ${JSON.stringify(bad)}`);
      assert.equal(parseCoordinatePair(BASE_LAT, bad), null, `lng ${JSON.stringify(bad)}`);
    }
  });

  it("rejects exact 0,0 as the no-fix sentinel", () => {
    assert.equal(parseCoordinatePair(0, 0), null);
    assert.equal(parseCoordinatePair("0", "0"), null);
  });

  it("rejects out-of-range coordinates", () => {
    assert.equal(parseCoordinatePair(91, 0), null);
    assert.equal(parseCoordinatePair(-91, 0), null);
    assert.equal(parseCoordinatePair(0, 181), null);
    assert.equal(parseCoordinatePair(0, -181), null);
    assert.equal(parseCoordinatePair(Infinity, 0), null);
  });

  it("accepts real numbers and numeric strings, and a valid zero on one axis", () => {
    assert.deepEqual(parseCoordinatePair(BASE_LAT, BASE_LNG), { lat: BASE_LAT, lng: BASE_LNG });
    assert.deepEqual(parseCoordinatePair(String(BASE_LAT), String(BASE_LNG)), {
      lat: BASE_LAT,
      lng: BASE_LNG,
    });
    assert.deepEqual(parseCoordinatePair(0, BASE_LNG), { lat: 0, lng: BASE_LNG });
    assert.deepEqual(parseCoordinatePair(-90, 180), { lat: -90, lng: 180 });
  });
});

describe("applyTechnicianLocationWrite coordinate validation", () => {
  beforeEach(() => {
    resetTechnicianLocationWriteStateForTests();
  });

  it("does not overwrite a good position when a null coordinate arrives", async () => {
    const Technician = createMockTechnician();
    await applyTechnicianLocationWrite({
      Technician,
      technicianId: "tech1",
      latitude: BASE_LAT,
      longitude: BASE_LNG,
    });
    const good = Technician.get("tech1").currentLocation.coordinates;

    const result = await applyTechnicianLocationWrite({
      Technician,
      technicianId: "tech1",
      latitude: null,
      longitude: null,
    });

    assert.equal(result.ok, false);
    assert.equal(result.reason, "invalid_coords");
    assert.deepEqual(
      Technician.get("tech1").currentLocation.coordinates,
      good,
      "stored position must be untouched"
    );
  });

  it("never broadcasts an invalid coordinate to the admin map", async () => {
    const Technician = createMockTechnician();
    const broadcasts = [];
    await applyTechnicianLocationWrite({
      Technician,
      technicianId: "tech1",
      latitude: "",
      longitude: "",
      onAdminBroadcast: (...a) => broadcasts.push(a),
    });
    assert.deepEqual(broadcasts, []);
  });
});

describe("resolveFixTime", () => {
  const NOW = Date.parse("2026-08-24T12:00:00.000Z");

  it("falls back to null when absent, so older app builds are unaffected", () => {
    assert.equal(resolveFixTime(undefined, NOW), null);
    assert.equal(resolveFixTime(null, NOW), null);
    assert.equal(resolveFixTime("", NOW), null);
    assert.equal(resolveFixTime("not-a-date", NOW), null);
  });

  it("uses the measurement time when it is in the past", () => {
    const measured = new Date(NOW - 90000).toISOString();
    assert.equal(resolveFixTime(measured, NOW).getTime(), NOW - 90000);
  });

  it("refuses a future timestamp so a fast client clock cannot pin itself fresh", () => {
    assert.equal(resolveFixTime(new Date(NOW + 600000).toISOString(), NOW), null);
  });

  it("clamps mild future skew back to now rather than rejecting it", () => {
    const t = resolveFixTime(new Date(NOW + 5000).toISOString(), NOW);
    assert.equal(t.getTime(), NOW);
  });
});

describe("liveness heartbeat freshness", () => {
  beforeEach(() => {
    resetTechnicianLocationWriteStateForTests();
  });

  it("a replayed pin from a dead GPS ages instead of reading fresh", async () => {
    const Technician = createMockTechnician();

    // A real fix lands.
    const measuredAt = new Date(Date.now() - 5 * 60 * 1000);
    await applyTechnicianLocationWrite({
      Technician,
      technicianId: "tech1",
      latitude: BASE_LAT,
      longitude: BASE_LNG,
      fixTime: measuredAt.toISOString(),
    });

    // GPS then dies; the liveness heartbeat replays the same pin carrying the
    // ORIGINAL fix time. Force past the heartbeat throttle so the write lands.
    setLocationWriteStateForTests("tech1", { lastHeartbeatAt: 0 });
    const beat = await applyTechnicianLocationWrite({
      Technician,
      technicianId: "tech1",
      latitude: BASE_LAT,
      longitude: BASE_LNG,
      fixTime: measuredAt.toISOString(),
    });

    assert.equal(beat.ok, true);
    assert.equal(beat.heartbeat, true);
    assert.equal(
      beat.lastLocationAt.getTime(),
      measuredAt.getTime(),
      "heartbeat must not stamp a frozen position as freshly measured"
    );

    const ageMs = Date.now() - Technician.get("tech1").lastLocationAt.getTime();
    assert.ok(ageMs > 60000, `stored position should read stale, was ${ageMs}ms old`);
  });

  it("a parked technician with live GPS still reads fresh", async () => {
    const Technician = createMockTechnician();
    await applyTechnicianLocationWrite({
      Technician,
      technicianId: "tech2",
      latitude: BASE_LAT,
      longitude: BASE_LNG,
      fixTime: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    });

    // Same coordinates, but the OS produced a brand-new reading.
    setLocationWriteStateForTests("tech2", { lastHeartbeatAt: 0 });
    const beat = await applyTechnicianLocationWrite({
      Technician,
      technicianId: "tech2",
      latitude: BASE_LAT,
      longitude: BASE_LNG,
      fixTime: new Date().toISOString(),
    });

    const ageMs = Date.now() - beat.lastLocationAt.getTime();
    assert.ok(ageMs < 5000, `stationary tech with live GPS must read fresh, was ${ageMs}ms`);
  });

  it("without a fix time it behaves exactly as before", async () => {
    const Technician = createMockTechnician();
    const before = Date.now();
    const res = await applyTechnicianLocationWrite({
      Technician,
      technicianId: "tech3",
      latitude: BASE_LAT,
      longitude: BASE_LNG,
    });
    assert.ok(res.lastLocationAt.getTime() >= before);
  });
});
