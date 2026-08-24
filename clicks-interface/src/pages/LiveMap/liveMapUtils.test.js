import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  LOCATION_STALE_MS,
  REST_POLL_MS,
  mergeApiTechnicianWithSocketState,
  isSocketOnlyPreserved,
  isTechLocationStale,
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

  it("isSocketOnlyPreserved drops old socket-only techs", () => {
    const apiIds = new Set();
    const presenceAt = new Date(now - REST_POLL_MS * 3).toISOString();
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
