const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildAdminJobListFilters,
  buildAdminJobStatsBaseFilters,
  kpiClause,
} = require("./adminJobListFilters");

test("garage=at_garage filters on garage.phase", () => {
  const { query, filterKeyParts } = buildAdminJobListFilters({
    garage: "at_garage",
    limit: 20,
  });
  assert.equal(query["garage.phase"], "at_garage");
  assert.ok(filterKeyParts.includes("garage:at_garage"));
});

test("kpi=on_hold excludes garage phases so the card matches the list", () => {
  const { query, filterKeyParts } = buildAdminJobListFilters({ kpi: "on_hold" });
  assert.ok(filterKeyParts.includes("kpi:on_hold"));
  const hold = query.$and ? query.$and[0] : query;
  assert.equal(hold.job_status, "on_hold");
  assert.deepEqual(hold.$nor, [{ "garage.phase": { $in: ["at_garage", "returning"] } }]);
});

test("kpi=accepted excludes returning drop-off jobs", () => {
  const clause = kpiClause("accepted");
  assert.equal(clause.job_status, "accepted");
  assert.deepEqual(clause.$nor, [{ "garage.phase": "returning" }]);
});

test("kpi=ongoing excludes returning drop-off jobs", () => {
  const { query } = buildAdminJobListFilters({ kpi: "ongoing" });
  const ongoing = query.$and ? query.$and[0] : query;
  assert.ok(Array.isArray(ongoing.job_status.$in));
  assert.ok(ongoing.job_status.$in.includes("en_route"));
  assert.ok(!ongoing.job_status.$in.includes("on_hold"));
  assert.deepEqual(ongoing.$nor, [{ "garage.phase": "returning" }]);
});

test("kpi=cancelledToday is today's cancellations, not all-time", () => {
  const { query, sort } = buildAdminJobListFilters({ kpi: "cancelledToday" });
  const hold = query.$and ? query.$and[0] : query;
  assert.equal(hold.job_status, "cancelled");
  assert.ok(hold.cancelled_at.$gte instanceof Date);
  assert.ok(hold.cancelled_at.$lte instanceof Date);
  assert.equal(JSON.stringify(query).includes("updatedAt"), false);
  assert.equal(sort.cancelled_at, -1);
});

test("kpi=completedToday uses completed_at, not scheduled dateTime", () => {
  const clause = kpiClause("completedToday", {
    rangeStart: new Date("2026-11-11T00:00:00+03:00"),
    rangeEnd: new Date("2026-11-11T23:59:59.999+03:00"),
  });
  assert.equal(clause.job_status.$in[0], "completed");
  assert.ok(clause.completed_at.$gte instanceof Date);
  assert.equal(JSON.stringify(clause).includes("updatedAt"), false);
});

test("kpi=completedToday with a date filter still uses completed_at", () => {
  const { query, filterKeyParts, sort } = buildAdminJobListFilters({
    kpi: "completedToday",
    dateFrom: "2026-11-01",
    dateTo: "2026-11-11",
  });
  assert.ok(filterKeyParts.includes("kpi:completedToday"));
  const hold = query.$and ? query.$and[0] : query;
  assert.ok(hold.completed_at.$gte instanceof Date);
  assert.equal(JSON.stringify(query).includes("dateTime"), false);
  assert.equal(sort.completed_at, -1);
});

test("kpi=createdToday without dates filters createdAt", () => {
  const { query } = buildAdminJobListFilters({ kpi: "createdToday" });
  const created = query.$and ? query.$and[0] : query;
  assert.ok(created.createdAt.$gte instanceof Date);
  assert.ok(created.createdAt.$lte instanceof Date);
});

test("kpi=unpaid excludes cancelled jobs", () => {
  const clause = kpiClause("unpaid");
  assert.equal(clause.payment_status, "unpaid");
  assert.deepEqual(clause.job_status, { $nin: ["cancelled"] });
});

test("kpi=open is every live status including on_hold", () => {
  const clause = kpiClause("open");
  assert.ok(clause.job_status.$in.includes("pending"));
  assert.ok(clause.job_status.$in.includes("on_hold"));
  assert.ok(!clause.job_status.$in.includes("completed"));
  assert.ok(!clause.job_status.$in.includes("cancelled"));
});

test("stats base filters strip kpi so cards are not self-filtered", () => {
  const { filterKeyParts, query } = buildAdminJobStatsBaseFilters({
    kpi: "pending",
    search: "5551",
    technician: "Ali",
  });
  assert.ok(!filterKeyParts.some((p) => p.startsWith("kpi:")));
  assert.equal(query.job_status, undefined);
});
