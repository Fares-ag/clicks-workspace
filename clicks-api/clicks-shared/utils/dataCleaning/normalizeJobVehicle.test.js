const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { normalizeJobVehicle } = require("./normalizeJobVehicle");
const { normalizePlate } = require("./normalizePlate");
const { normalizeCustomerKey } = require("./normalizeCustomerKey");
const { normalizeLocationArea } = require("./normalizeLocationArea");

describe("normalizeJobVehicle", () => {
  it("maps English typo tyota cmry", () => {
    const hit = normalizeJobVehicle({ make: "tyota", model: "cmry" });
    assert.equal(hit.canonicalMake, "Toyota");
    assert.equal(hit.canonicalModel, "Camry");
    assert.ok(hit.confidence >= 0.65);
  });

  it("maps Arabic تويتا كامري", () => {
    const hit = normalizeJobVehicle({ make: "تويتا", model: "كامري" });
    assert.equal(hit.canonicalMake, "Toyota");
    assert.equal(hit.canonicalModel, "Camry");
    assert.equal(hit.method, "arabic");
  });

  it("uses split catalog fields when already clean", () => {
    const hit = normalizeJobVehicle({ make: "Toyota", model: "Camry" });
    assert.equal(hit.canonicalMake, "Toyota");
    assert.equal(hit.canonicalModel, "Camry");
    assert.equal(hit.method, "exact");
  });

  it("pulls year out of the combined string", () => {
    const hit = normalizeJobVehicle({ make: "Toyota", model: "Camry 2018" });
    assert.equal(hit.canonicalMake, "Toyota");
    assert.equal(hit.canonicalModel, "Camry");
    assert.equal(hit.canonicalYear, 2018);
  });

  it("returns unmatched for empty input", () => {
    const hit = normalizeJobVehicle({ make: "", model: "" });
    assert.equal(hit.method, "unmatched");
    assert.equal(hit.canonicalMake, "");
  });
});

describe("normalizePlate", () => {
  it("strips spaces and uppercases", () => {
    assert.equal(normalizePlate("  12345 a  ").canonicalPlate, "12345A");
  });

  it("converts Arabic-Indic digits", () => {
    assert.equal(normalizePlate("١٢٣٤٥").canonicalPlate, "12345");
  });
});

describe("normalizeCustomerKey", () => {
  it("collapses +974 and local numbers to last 8", () => {
    const a = normalizeCustomerKey("Ahmed", "+974 33123456");
    const b = normalizeCustomerKey("احمد", "33123456");
    assert.equal(a.phoneKey, "33123456");
    assert.equal(b.phoneKey, "33123456");
  });
});

describe("normalizeLocationArea", () => {
  it("maps Pearl coordinates", () => {
    const hit = normalizeLocationArea("", {
      type: "Point",
      coordinates: [51.55, 25.37],
    });
    assert.equal(hit.areaId, "the_pearl");
    assert.equal(hit.method, "coords");
  });

  it("maps Arabic area name", () => {
    const hit = normalizeLocationArea("الوكرة قرب الميناء");
    assert.equal(hit.areaId, "al_wakrah");
  });
});
