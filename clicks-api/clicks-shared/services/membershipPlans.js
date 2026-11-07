/** Catalog constants and seed defaults for customer service memberships. */

const SERVICE_TAB_TYPES = [
  "Battery Change",
  "Oil Change",
  "Full Service",
  "Car Wash - Interior",
  "Car Wash - Exterior",
  "Car Wash - Full",
  "Tyre Change",
  "Car Wash - Full Polish",
  "Car Tinting",
  "Breakdown Vehicle",
];

const WASH_TYPES = [
  "Car Wash - Interior",
  "Car Wash - Exterior",
  "Car Wash - Full",
  "Car Wash - Full Polish",
];

const DISCOUNT_ELIGIBLE_TYPES = SERVICE_TAB_TYPES.filter(
  (t) => t !== "Breakdown Vehicle"
);

const WASH_INCLUDED = {
  serviceTypes: WASH_TYPES,
  quota: 1,
  bucket: "wash",
};

const DEFAULT_PLANS = [
  {
    code: "basic",
    name_en: "Basic",
    name_ar: "أساسي",
    discountPercent: 10,
    eligibleServiceTypes: DISCOUNT_ELIGIBLE_TYPES,
    sortOrder: 1,
    active: true,
    intervals: [
      {
        interval: "month",
        durationMonths: 1,
        priceQar: 29,
        included: [
          {
            serviceTypes: ["Car Wash - Exterior"],
            quota: 1,
            bucket: "wash-exterior",
          },
        ],
      },
      {
        interval: "year",
        durationMonths: 12,
        priceQar: 199,
        included: [
          {
            serviceTypes: ["Car Wash - Exterior"],
            quota: 2,
            bucket: "wash-exterior",
          },
          { serviceTypes: ["Oil Change"], quota: 1, bucket: "oil" },
        ],
      },
    ],
  },
  {
    code: "plus",
    name_en: "Plus",
    name_ar: "بلس",
    discountPercent: 15,
    eligibleServiceTypes: DISCOUNT_ELIGIBLE_TYPES,
    sortOrder: 2,
    active: true,
    intervals: [
      {
        interval: "month",
        durationMonths: 1,
        priceQar: 39,
        included: [{ ...WASH_INCLUDED, quota: 1 }],
      },
      {
        interval: "year",
        durationMonths: 12,
        priceQar: 299,
        included: [
          { ...WASH_INCLUDED, quota: 4 },
          { serviceTypes: ["Oil Change"], quota: 2, bucket: "oil" },
          { serviceTypes: ["Battery Change"], quota: 1, bucket: "battery" },
        ],
      },
    ],
  },
];

function findInterval(plan, interval) {
  const list = plan?.intervals || [];
  return list.find((row) => row.interval === interval) || null;
}

const QATAR_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

/**
 * Calendar months in Qatar time (UTC+3, no DST), clamped to the last day of
 * the target month: 31 Jan + 1 month = 28/29 Feb, never 2/3 March. Server
 * timezone does not matter.
 */
function addMonths(date, months) {
  const ms = new Date(date).getTime();
  if (!Number.isFinite(ms)) return new Date(NaN);
  const q = new Date(ms + QATAR_UTC_OFFSET_MS);
  const total = q.getUTCMonth() + Math.trunc(Number(months) || 0);
  const year = q.getUTCFullYear() + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const wall = Date.UTC(
    year,
    month,
    Math.min(q.getUTCDate(), lastDay),
    q.getUTCHours(),
    q.getUTCMinutes(),
    q.getUTCSeconds(),
    q.getUTCMilliseconds()
  );
  return new Date(wall - QATAR_UTC_OFFSET_MS);
}

async function seedMembershipPlans(SubscriptionPlan) {
  const Model = SubscriptionPlan || require("../models/SubscriptionPlan");
  const saved = [];
  for (const plan of DEFAULT_PLANS) {
    const doc = await Model.findOneAndUpdate(
      { code: plan.code },
      { $set: plan },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    saved.push(doc);
  }
  return saved;
}

module.exports = {
  SERVICE_TAB_TYPES,
  WASH_TYPES,
  DISCOUNT_ELIGIBLE_TYPES,
  DEFAULT_PLANS,
  findInterval,
  addMonths,
  seedMembershipPlans,
};
