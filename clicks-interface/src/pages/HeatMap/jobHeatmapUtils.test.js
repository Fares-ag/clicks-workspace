const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveDateRange,
  resolveTimeRange,
  parseTimeToHour,
  formatHourLabel,
  formatShortDate,
  normalizeLocationString,
} = require("./jobHeatmapUtils.js");

describe("resolveDateRange", () => {
  it("returns empty for all time", () => {
    assert.deepEqual(resolveDateRange("all"), {});
  });

  it("returns from/to for 7d", () => {
    const r = resolveDateRange("7d");
    assert.ok(r.from);
    assert.ok(r.to);
    assert.ok(new Date(r.to) - new Date(r.from) >= 6 * 86400000);
  });
});

describe("resolveTimeRange", () => {
  it("returns empty for all hours", () => {
    assert.deepEqual(resolveTimeRange("all"), {});
  });

  it("returns preset hours for business", () => {
    assert.deepEqual(resolveTimeRange("business"), { hourFrom: 8, hourTo: 18 });
  });

  it("parses custom time inputs", () => {
    assert.deepEqual(resolveTimeRange("custom", "09:30", "17:00"), {
      hourFrom: 9,
      hourTo: 17,
    });
  });
});

describe("parseTimeToHour", () => {
  it("parses HH:mm", () => {
    assert.equal(parseTimeToHour("14:30"), 14);
  });

  it("rejects invalid", () => {
    assert.equal(parseTimeToHour(""), null);
  });
});

describe("formatHourLabel", () => {
  it("formats noon and midnight", () => {
    assert.equal(formatHourLabel(0), "12am");
    assert.equal(formatHourLabel(12), "12pm");
    assert.equal(formatHourLabel(18), "6pm");
  });
});

describe("normalizeLocationString", () => {
  it("normalizes LatLng", () => {
    assert.equal(normalizeLocationString("LatLng(25.1, 51.5)"), "25.1, 51.5");
  });
});

describe("formatShortDate", () => {
  it("formats ISO date", () => {
    assert.ok(formatShortDate("2025-07-15T00:00:00.000Z").length > 0);
  });

  it("handles empty", () => {
    assert.equal(formatShortDate(null), "");
  });
});
