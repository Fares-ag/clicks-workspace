const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isEmergencyServiceType,
  findIncludedRow,
  remainingQuota,
  usageKey,
  adjustPricing,
  serializeCover,
} = require("./membershipEntitlement");
const { DEFAULT_PLANS, findInterval } = require("./membershipPlans");

const plusYear = findInterval(
  DEFAULT_PLANS.find((p) => p.code === "plus"),
  "year"
);
const plusMonth = findInterval(
  DEFAULT_PLANS.find((p) => p.code === "plus"),
  "month"
);
const basicMonth = findInterval(
  DEFAULT_PLANS.find((p) => p.code === "basic"),
  "month"
);

function subFromSku(sku, extra = {}) {
  return {
    included: sku.included,
    usage: extra.usage || [],
    discountPercent: extra.discountPercent ?? 15,
    eligibleServiceTypes: extra.eligibleServiceTypes || [
      "Car Wash - Exterior",
      "Oil Change",
      "Tyre Change",
      "Car Tinting",
      "Full Service",
      "Battery Change",
    ],
  };
}

test("SOS and emergency types never count as included", () => {
  assert.equal(isEmergencyServiceType("SOS"), true);
  assert.equal(isEmergencyServiceType("Towing"), true);
  assert.equal(isEmergencyServiceType("Jump Start"), true);
  assert.equal(isEmergencyServiceType("Breakdown Vehicle"), true);
  assert.equal(isEmergencyServiceType("Car Wash - Exterior"), false);
  assert.equal(isEmergencyServiceType("Oil Change"), false);
});

test("wash bucket shares one quota across interior/exterior/full/polish", () => {
  const sub = subFromSku(plusMonth);
  const interior = findIncludedRow(sub, "Car Wash - Interior");
  const exterior = findIncludedRow(sub, "Car Wash - Exterior");
  assert.ok(interior);
  assert.equal(usageKey(interior), usageKey(exterior));
  assert.equal(remainingQuota(sub, interior), 1);
});

test("monthly vs yearly quotas differ and do not use 12x", () => {
  const monthSub = subFromSku(plusMonth);
  const yearSub = subFromSku(plusYear);
  const washMonth = findIncludedRow(monthSub, "Car Wash - Full");
  const washYear = findIncludedRow(yearSub, "Car Wash - Full");
  assert.equal(remainingQuota(monthSub, washMonth), 1);
  assert.equal(remainingQuota(yearSub, washYear), 4);
  const oilYear = findIncludedRow(yearSub, "Oil Change");
  assert.equal(remainingQuota(yearSub, oilYear), 2);
  assert.equal(findIncludedRow(monthSub, "Oil Change"), null);
});

test("included visit zeros the service line and keeps extras", () => {
  const priced = adjustPricing(
    {
      total: 80,
      basePrice: 50,
      distanceFee: 0,
      timeFee: 0,
      repairsTotal: 30,
      costTotal: 10,
      profit: 70,
      serviceCharge: 0,
    },
    { cover: "included", discountPercent: 0 }
  );
  assert.equal(priced.total, 30);
  assert.equal(priced.basePrice, 0);
  assert.equal(priced.membership.cover, "included");
});

test("discounted cover applies percent off the priced total", () => {
  const priced = adjustPricing(
    {
      total: 200,
      basePrice: 200,
      distanceFee: 0,
      timeFee: 0,
      repairsTotal: 0,
      costTotal: 0,
      profit: 200,
      serviceCharge: 0,
    },
    { cover: "discounted", discountPercent: 15 }
  );
  assert.equal(priced.total, 170);
});

test("quota remaining drops after usage; cancelled bookings do not appear in usage", () => {
  const sub = subFromSku(basicMonth, {
    usage: [{ bucket: "wash-exterior", used: 0 }],
  });
  const row = findIncludedRow(sub, "Car Wash - Exterior");
  assert.equal(remainingQuota(sub, row), 1);
  sub.usage = [{ bucket: "wash-exterior", used: 1 }];
  assert.equal(remainingQuota(sub, row), 0);
});

test("serializeCover keeps none when SOS path never called entitlement", () => {
  const snap = serializeCover({ cover: "none" });
  assert.equal(snap.cover, "none");
  assert.equal(snap.included, false);
});
