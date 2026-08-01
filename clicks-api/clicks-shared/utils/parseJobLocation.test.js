const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  parseJobLocation,
  toGeoPoint,
  parseJobLocationToGeoPoint,
  normalizeLocationString,
  isWithinQatar,
} = require("./parseJobLocation");

describe("parseJobLocation", () => {
  it("parses LatLng(...)", () => {
    assert.deepEqual(parseJobLocation("LatLng(25.1506195, 51.5856095)"), {
      lat: 25.1506195,
      lng: 51.5856095,
    });
  });

  it("parses plain lat, lng", () => {
    assert.deepEqual(parseJobLocation("25.35, 51.52"), {
      lat: 25.35,
      lng: 51.52,
    });
  });

  it("parses Waze URL with %2C", () => {
    const url =
      "https://www.waze.com/live-map/directions?to=ll.25.321963%2C51.53281";
    assert.deepEqual(parseJobLocation(url), {
      lat: 25.321963,
      lng: 51.53281,
    });
  });

  it("parses Waze URL with comma", () => {
    const url =
      "https://www.waze.com/live-map/directions?to=ll.25.236776,51.512511";
    assert.deepEqual(parseJobLocation(url), {
      lat: 25.236776,
      lng: 51.512511,
    });
  });

  it("parses Google Maps @lat,lng", () => {
    const url =
      "https://www.google.com/maps/place/25%C2%B015'37.6%22N+51%C2%B029'59.1%22E/@25.2604477,51.4971613,17z";
    assert.deepEqual(parseJobLocation(url), {
      lat: 25.2604477,
      lng: 51.4971613,
    });
  });

  it("rejects phone numbers", () => {
    assert.equal(parseJobLocation("+974 5047 5279"), null);
  });

  it("rejects empty / null", () => {
    assert.equal(parseJobLocation(""), null);
    assert.equal(parseJobLocation(null), null);
  });

  it("rejects out-of-bounds coordinates", () => {
    assert.equal(parseJobLocation("40.7128, -74.0060"), null); // NYC
    assert.equal(parseJobLocation("LatLng(0, 0)"), null);
  });

  it("accepts Qatar bounds edges", () => {
    assert.ok(isWithinQatar(24.0, 50.0));
    assert.ok(isWithinQatar(26.5, 52.5));
    assert.equal(isWithinQatar(23.9, 51.5), false);
  });
});

describe("toGeoPoint", () => {
  it("returns GeoJSON Point [lng, lat]", () => {
    assert.deepEqual(toGeoPoint({ lat: 25.3, lng: 51.5 }), {
      type: "Point",
      coordinates: [51.5, 25.3],
    });
  });
});

describe("parseJobLocationToGeoPoint", () => {
  it("returns point for valid location", () => {
    assert.deepEqual(parseJobLocationToGeoPoint("25.3, 51.5"), {
      type: "Point",
      coordinates: [51.5, 25.3],
    });
  });

  it("returns null for invalid", () => {
    assert.equal(parseJobLocationToGeoPoint("not a place"), null);
  });
});

describe("normalizeLocationString", () => {
  it("converts LatLng to comma form", () => {
    assert.equal(
      normalizeLocationString("LatLng(25.1, 51.5)"),
      "25.1, 51.5"
    );
  });

  it("passes through other strings", () => {
    assert.equal(normalizeLocationString("  Doha  "), "Doha");
  });
});
