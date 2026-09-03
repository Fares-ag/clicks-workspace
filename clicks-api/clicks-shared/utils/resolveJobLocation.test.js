const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveJobLocationToGeoPoint,
  resolveJobLocationToGeoPointRequired,
  LOCATION_RESOLVE_ERROR,
} = require("./resolveJobLocation");

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

  it("resolves ibis Doha from expanded goo.gl target URL", async () => {
    const expanded =
      "https://www.google.com/maps/place/ibis+Doha/@25.2641841,51.5075435,15z/data=!4m9!3m8!1s0x3e45db71e7434f7f:0xe99eb128790bba4a!5m2!4m1!1i2!8m2!3d25.2701124!4d51.5142408!16s%2Fg%2F11jyzkz_mv";
    const geo = await resolveJobLocationToGeoPoint(expanded);
    assert.deepEqual(geo, {
      type: "Point",
      coordinates: [51.5142408, 25.2701124],
    });
  });

  it("returns null for unusable input", async () => {
    assert.equal(await resolveJobLocationToGeoPoint(""), null);
    assert.equal(await resolveJobLocationToGeoPoint("+974 5047 5279"), null);
  });
});

describe("resolveJobLocationToGeoPointRequired", () => {
  it("returns geo for valid lat,lng", async () => {
    const geo = await resolveJobLocationToGeoPointRequired("25.35, 51.52");
    assert.deepEqual(geo.coordinates, [51.52, 25.35]);
  });

  it("throws 400 for unresolvable input", async () => {
    await assert.rejects(
      () => resolveJobLocationToGeoPointRequired("+974 5047 5279"),
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.message, LOCATION_RESOLVE_ERROR);
        return true;
      }
    );
  });

  it("throws 400 for empty location", async () => {
    await assert.rejects(
      () => resolveJobLocationToGeoPointRequired("   "),
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.message, "Location is required");
        return true;
      }
    );
  });
});
