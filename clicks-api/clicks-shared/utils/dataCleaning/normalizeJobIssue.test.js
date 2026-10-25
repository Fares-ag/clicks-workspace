const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { normalizeJobIssue } = require("./normalizeJobIssue");
const { normalizeJobType } = require("./normalizeJobType");
const { applyCanonicalJobFields } = require("./applyCanonicalFields");
const { LEGACY_JOB_TYPES, JOB_TYPES } = require("../../constants/jobTypes");

describe("normalizeJobIssue", () => {
  it("maps historical tire repair", () => {
    const hit = normalizeJobIssue("tire repair");
    assert.equal(hit.canonicalIssueId, "puncture_repair");
    assert.equal(hit.suggestedJobType, "Flat Tire");
    assert.ok(hit.confidence >= 0.9);
  });

  it("maps English typo tyre puncure", () => {
    const hit = normalizeJobIssue("tyre puncure");
    assert.equal(hit.canonicalIssueId, "puncture_repair");
    assert.ok(hit.method === "exact" || hit.method === "alias" || hit.method === "fuzzy");
  });

  it("maps Arabic puncture", () => {
    const hit = normalizeJobIssue("بنشر");
    assert.equal(hit.canonicalIssueId, "puncture_repair");
    assert.equal(hit.method, "arabic");
  });

  it("maps Arabic tire change", () => {
    const hit = normalizeJobIssue("تغيير كفر");
    assert.equal(hit.canonicalIssueId, "tire_change");
    assert.equal(hit.suggestedJobType, "Tire Change");
  });

  it("leaves Unknown unmatched", () => {
    const hit = normalizeJobIssue("Unknown");
    assert.equal(hit.canonicalIssueId, "unmapped");
    assert.equal(hit.method, "unmatched");
  });

  it("leaves empty unmatched", () => {
    const hit = normalizeJobIssue("");
    assert.equal(hit.canonicalIssueId, "unmapped");
  });

  it("uses extra aliases without a deploy", () => {
    const hit = normalizeJobIssue("كفر مسطّح", "", [
      { alias: "كفر مسطح", canonicalIssueId: "puncture_repair" },
    ]);
    assert.equal(hit.canonicalIssueId, "puncture_repair");
  });
});

describe("normalizeJobType", () => {
  it("maps every legacy job type to a current catalog value", () => {
    for (const raw of LEGACY_JOB_TYPES) {
      const hit = normalizeJobType(raw);
      assert.ok(
        JOB_TYPES.includes(hit.canonicalJobType),
        `${raw} → ${hit.canonicalJobType}`
      );
    }
  });

  it("prefers issue-derived type for Engines legacy bucket", () => {
    const issue = normalizeJobIssue("بنشر");
    const hit = normalizeJobType("Engines", issue);
    assert.equal(hit.canonicalJobType, "Flat Tire");
    assert.equal(hit.method, "issueDerived");
  });

  it("keeps a modern type that already matches", () => {
    const hit = normalizeJobType("Towing");
    assert.equal(hit.canonicalJobType, "Towing");
    assert.equal(hit.method, "exact");
  });
});

describe("applyCanonicalJobFields", () => {
  it("writes high-confidence issue and vehicle on create", () => {
    const doc = {
      issue: "tire repair",
      jobType: "Engines",
      vehicleMake: "tyota",
      vehicleModel: "cmry",
      licensePlate: "١٢٣",
    };
    applyCanonicalJobFields(doc);
    assert.equal(doc.issue, "Puncture repair");
    assert.equal(doc.jobType, "Flat Tire");
    assert.equal(doc.vehicleMake, "Toyota");
    assert.equal(doc.vehicleModel, "Camry");
    assert.equal(doc.licensePlate, "123");
  });

  it("leaves unknown issue text alone", () => {
    const doc = { issue: "Unknown", jobType: "Towing" };
    applyCanonicalJobFields(doc);
    assert.equal(doc.issue, "Unknown");
    assert.equal(doc.jobType, "Towing");
  });
});
