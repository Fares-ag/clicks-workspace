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

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + Number(months));
  return d;
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
