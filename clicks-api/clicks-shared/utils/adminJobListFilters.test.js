const test = require("node:test");
const assert = require("node:assert/strict");
const { buildAdminJobListFilters } = require("./adminJobListFilters");

test("garage=at_garage filters on garage.phase", () => {
  const { query, filterKeyParts } = buildAdminJobListFilters({
    garage: "at_garage",
    limit: 20,
  });
  assert.equal(query["garage.phase"], "at_garage");
  assert.ok(filterKeyParts.includes("garage:at_garage"));
});
