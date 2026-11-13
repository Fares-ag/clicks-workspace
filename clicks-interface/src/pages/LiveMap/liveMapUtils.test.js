import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  LOCATION_STALE_MS,
  OFFLINE_ECHO_GUARD_MS,
  REST_POLL_MS,
  REST_RESYNC_MS,
  SOCKET_ONLY_GRACE_MS,
  countVisibleStaleTechnicians,
  formatPresenceLabel,
  mergeApiTechnicianWithSocketState,
  mergeLiveMapSnapshot,
  isSocketOnlyPreserved,
  isTechGpsStale,
  isTechLocationStale,
  isTechPresenceStale,
} from "./liveMapUtils.js";

describe("liveMapUtils", () => {
  const now = Date.parse("2026-07-31T12:00:00.000Z");

  it("isTechLocationStale respects locationStale flag", () => {
    assert.equal(isTechLocationStale({ locationStale: true }, now), true);
  });

  it("isTechLocationStale is false when lastLocationAt is fresh", () => {
    const ts = new Date(now - 30_000).toISOString();
    assert.equal(
      isTechLocationStale({ lastLocationAt: ts, locationStale: false }, now),
      false
    );
  });

  it("isTechLocationStale is true when lastLocationAt exceeds window", () => {
    const ts = new Date(now - LOCATION_STALE_MS - 1).toISOString();
    assert.equal(isTechLocationStale({ lastLocationAt: ts }, now), true);
  });

  it("parked technician with a live heartbeat is connected, GPS-stale only", () => {
    const gps = new Date(now - 5 * 60_000).toISOString();
    const heard = new Date(now - 8_000).toISOString();
    const tech = { lastLocationAt: gps, lastHeartbeatAt: heard, locationStale: true };
    assert.equal(isTechGpsStale(tech, now), true);
    assert.equal(isTechPresenceStale(tech, now), false);
    assert.equal(isTechLocationStale(tech, now), false);
    assert.equal(formatPresenceLabel(tech, now), "Connected · GPS 5m ago");
  });

  it("merge does not treat a stale-event arrival stamp as a live heartbeat", () => {
    const gps = new Date(now - 60 * 60_000).toISOString();
    const heard = new Date(now - LOCATION_STALE_MS - 1).toISOString();
    const merged = mergeApiTechnicianWithSocketState(
      {
        _id: "t1",
        lastLocationAt: gps,
        lastHeartbeatAt: heard,
        presenceStale: true,
      },
      {
        _id: "t1",
        lastLocationAt: gps,
        lastHeartbeatAt: heard,
        presenceStale: true,
        location: { latitude: 25, longitude: 51 },
        _locationUpdatedAt: gps,
      },
      now
    );
    assert.equal(merged.presenceStale, true);
    assert.equal(isTechPresenceStale(merged, now), true);
  });

  it("heartbeat older than the window is disconnected even if GPS looks recent", () => {
    const gps = new Date(now - 10_000).toISOString();
    const heard = new Date(now - LOCATION_STALE_MS - 1).toISOString();
    const tech = { lastLocationAt: gps, lastHeartbeatAt: heard };
    assert.equal(isTechPresenceStale(tech, now), true);
  });

  it("mergeApiTechnicianWithSocketState prefers fresh socket coords", () => {
    const socketAt = new Date(now - 5_000).toISOString();
    const merged = mergeApiTechnicianWithSocketState(
      {
        _id: "t1",
        location: { latitude: 1, longitude: 2 },
        lastLocationAt: new Date(now - 20_000).toISOString(),
        locationStale: false,
      },
      {
        _id: "t1",
        location: { latitude: 9, longitude: 8 },
        _locationUpdatedAt: socketAt,
        lastLocationAt: socketAt,
        locationStale: false,
      },
      now
    );
    assert.deepEqual(merged.location, { latitude: 9, longitude: 8 });
  });

  it("mergeApiTechnicianWithSocketState uses REST when socket is old", () => {
    const socketAt = new Date(now - 120_000).toISOString();
    const merged = mergeApiTechnicianWithSocketState(
      {
        _id: "t1",
        location: { latitude: 1, longitude: 2 },
        lastLocationAt: new Date(now - 10_000).toISOString(),
      },
      {
        _id: "t1",
        location: { latitude: 9, longitude: 8 },
        _locationUpdatedAt: socketAt,
      },
      now
    );
    assert.deepEqual(merged.location, { latitude: 1, longitude: 2 });
  });

  it("isSocketOnlyPreserved keeps recent socket-only techs", () => {
    const apiIds = new Set(["other"]);
    const presenceAt = new Date(now - REST_POLL_MS).toISOString();
    assert.equal(
      isSocketOnlyPreserved(
        {
          _id: "new1",
          currentStatus: "Online",
          _socketPresenceAt: presenceAt,
        },
        apiIds,
        now
      ),
      true
    );
  });

  it("isSocketOnlyPreserved survives a late heartbeat and a full REST re-read cycle", () => {
    // Heartbeats land every 12-14 s. One late or throttled beat (24 s gap) used
    // to be enough to drop a technician who had come Online after page load.
    const apiIds = new Set(["other"]);
    for (const gapMs of [16000, 24000, REST_RESYNC_MS * 2]) {
      assert.equal(
        isSocketOnlyPreserved(
          {
            _id: "new1",
            currentStatus: "Online",
            _socketPresenceAt: new Date(now - gapMs).toISOString(),
          },
          apiIds,
          now
        ),
        true,
        `must survive a ${gapMs} ms gap`
      );
    }
    assert.ok(SOCKET_ONLY_GRACE_MS > REST_RESYNC_MS * 2);
  });

  it("isSocketOnlyPreserved drops old socket-only techs", () => {
    const apiIds = new Set();
    const presenceAt = new Date(now - SOCKET_ONLY_GRACE_MS - 1000).toISOString();
    assert.equal(
      isSocketOnlyPreserved(
        {
          _id: "old1",
          currentStatus: "Online",
          _socketPresenceAt: presenceAt,
        },
        apiIds,
        now
      ),
      false
    );
  });

  it("mergeApiTechnicianWithSocketState does not let a quietly-dead socket beat fresher REST", () => {
    // The socket last delivered 45s ago and has since gone silent without
    // disconnecting, so its message still looks "recent" by arrival time.
    // REST has a genuinely newer measurement and must win.
    const socketAt = new Date(now - 45_000).toISOString();
    const merged = mergeApiTechnicianWithSocketState(
      {
        _id: "t1",
        location: { latitude: 1, longitude: 2 },
        lastLocationAt: new Date(now - 3_000).toISOString(),
      },
      {
        _id: "t1",
        location: { latitude: 9, longitude: 8 },
        _locationUpdatedAt: socketAt,
        lastLocationAt: socketAt,
      },
      now
    );
    assert.deepEqual(merged.location, { latitude: 1, longitude: 2 });
    assert.equal(merged.lastLocationAt, new Date(now - 3_000).toISOString());
  });

  it("mergeApiTechnicianWithSocketState keeps socket coords when they are the newest thing we have", () => {
    // Both old — the map should still show the freshest known position rather
    // than rewinding, and let the staleness UI mark it.
    const socketAt = new Date(now - 90_000).toISOString();
    const merged = mergeApiTechnicianWithSocketState(
      {
        _id: "t1",
        location: { latitude: 1, longitude: 2 },
        lastLocationAt: new Date(now - 200_000).toISOString(),
      },
      {
        _id: "t1",
        location: { latitude: 9, longitude: 8 },
        _locationUpdatedAt: socketAt,
        lastLocationAt: socketAt,
      },
      now
    );
    assert.deepEqual(merged.location, { latitude: 9, longitude: 8 });
  });

  it("mergeApiTechnicianWithSocketState prefers REST on an exact timestamp tie", () => {
    const ts = new Date(now - 10_000).toISOString();
    const merged = mergeApiTechnicianWithSocketState(
      { _id: "t1", location: { latitude: 1, longitude: 2 }, lastLocationAt: ts },
      { _id: "t1", location: { latitude: 9, longitude: 8 }, _locationUpdatedAt: ts, lastLocationAt: ts },
      now
    );
    assert.deepEqual(merged.location, { latitude: 1, longitude: 2 });
  });

  it("mergeApiTechnicianWithSocketState ignores an unparseable socket timestamp", () => {
    const merged = mergeApiTechnicianWithSocketState(
      { _id: "t1", location: { latitude: 1, longitude: 2 }, lastLocationAt: null },
      {
        _id: "t1",
        location: { latitude: 9, longitude: 8 },
        _locationUpdatedAt: "not-a-date",
        lastLocationAt: "not-a-date",
      },
      now
    );
    assert.deepEqual(merged.location, { latitude: 1, longitude: 2 });
  });
});

describe("mergeLiveMapSnapshot — every Online technician stays on the map", () => {
  const now = Date.parse("2026-11-13T12:00:00.000Z");
  const iso = (msAgo) => new Date(now - msAgo).toISOString();
  const apiRow = (id, extra = {}) => ({
    _id: id,
    firstName: "Tech",
    lastName: id,
    currentStatus: "Online",
    location: { latitude: 25.3, longitude: 51.5 },
    lastLocationAt: iso(5000),
    lastHeartbeatAt: iso(5000),
    presenceStale: false,
    ...extra,
  });

  it("adds a technician the socket never told us about", () => {
    // Came Online while an event was missed (reconnect gap). The next REST
    // re-read is the only thing that can put them on the map.
    const prev = [apiRow("a")];
    const { technicians, apiIds } = mergeLiveMapSnapshot(
      [apiRow("a"), apiRow("b")],
      prev,
      new Map(),
      now
    );
    assert.deepEqual(technicians.map((t) => t._id), ["a", "b"]);
    assert.equal(apiIds.has("b"), true);
    assert.equal(countVisibleStaleTechnicians(technicians, now), 0);
  });

  it("removes a technician who went Offline while the socket was not delivering", () => {
    const prev = [apiRow("a"), apiRow("gone", { lastHeartbeatAt: iso(5 * 60000) })];
    const { technicians } = mergeLiveMapSnapshot([apiRow("a")], prev, new Map(), now);
    assert.deepEqual(technicians.map((t) => t._id), ["a"]);
  });

  it("keeps a just-arrived technician until REST lists them", () => {
    const justOnline = {
      _id: "new",
      currentStatus: "Online",
      location: { latitude: 25.31, longitude: 51.51 },
      _socketPresenceAt: iso(REST_RESYNC_MS + 2000),
    };
    // A snapshot taken a moment before they came Online.
    const first = mergeLiveMapSnapshot([apiRow("a")], [apiRow("a"), justOnline], new Map(), now);
    assert.deepEqual(first.technicians.map((t) => t._id), ["a", "new"]);
    // The next one has them.
    const second = mergeLiveMapSnapshot(
      [apiRow("a"), apiRow("new")],
      first.technicians,
      new Map(),
      now
    );
    assert.deepEqual(second.technicians.map((t) => t._id), ["a", "new"]);
    assert.equal(second.apiIds.has("new"), true);
  });

  it("a snapshot already in flight cannot resurrect a technician who just went Offline", () => {
    const recentlyOffline = new Map([["a", now - 3000]]);
    const { technicians, apiIds } = mergeLiveMapSnapshot([apiRow("a")], [], recentlyOffline, now);
    assert.deepEqual(technicians, []);
    assert.equal(apiIds.has("a"), false);

    // Once the guard has lapsed REST is believed again (they came back Online
    // and that event was the one we missed).
    const later = mergeLiveMapSnapshot(
      [apiRow("a")],
      [],
      new Map([["a", now - OFFLINE_ECHO_GUARD_MS - 1]]),
      now
    );
    assert.deepEqual(later.technicians.map((t) => t._id), ["a"]);
  });

  it("a fresh REST heartbeat clears a technician the socket stopped updating", () => {
    // Silent-dead socket: our copy has aged past the window, the database has not.
    const staleLocal = {
      ...apiRow("a"),
      lastHeartbeatAt: iso(3 * 60000),
      _socketPresenceAt: iso(3 * 60000),
      presenceStale: true,
    };
    assert.equal(isTechPresenceStale(staleLocal, now), true);
    const { technicians } = mergeLiveMapSnapshot([apiRow("a")], [staleLocal], new Map(), now);
    assert.equal(isTechPresenceStale(technicians[0], now), false);
    assert.equal(formatPresenceLabel(technicians[0], now), "Live");
  });

  it("an On Job technician is merged exactly like an Online one", () => {
    const { technicians } = mergeLiveMapSnapshot(
      [apiRow("a", { currentStatus: "On Job" })],
      [],
      new Map(),
      now
    );
    assert.equal(technicians[0].currentStatus, "On Job");
    assert.equal(isTechPresenceStale(technicians[0], now), false);
  });
});
