const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { resolveJobLocationToGeoPoint } = require("./resolveJobLocation");

describe("resolveJobLocationToGeoPoint", () => {
  it("resolves plain lat,lng without network", async () => {
    const geo = await resolveJobLocationToGeoPoint("25.35, 51.52");
    assert.deepEqual(geo, {
      type: "Point",
      coordinates: [51.52, 25.35],
    });
  });

  it("resolves full Google Maps URL without network", async () => {
    const url =
      "https://www.google.com/maps/place/Doha/@25.285447,51.53104,14z";
    const geo = await resolveJobLocationToGeoPoint(url);
    assert.deepEqual(geo, {
      type: "Point",
      coordinates: [51.53104, 25.285447],
    });
  });

  it("returns null for unusable input", async () => {
    assert.equal(await resolveJobLocationToGeoPoint(""), null);
    assert.equal(await resolveJobLocationToGeoPoint("+974 5047 5279"), null);
  });
});
