const { SubscriptionPlan } = require("../../../clicks-shared/models");
const {
  DISCOUNT_ELIGIBLE_TYPES,
} = require("../../../clicks-shared/services/membershipPlans");

function serialize(plan) {
  const o = plan.toObject ? plan.toObject() : plan;
  return {
    id: o._id.toString(),
    _id: o._id.toString(),
    code: o.code,
    name_en: o.name_en,
    name_ar: o.name_ar,
    discountPercent: o.discountPercent,
    eligibleServiceTypes: o.eligibleServiceTypes || [],
    intervals: o.intervals || [],
    active: o.active,
    sortOrder: o.sortOrder,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

function normalizeIntervals(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((row) => row && (row.interval === "month" || row.interval === "year"))
    .map((row) => ({
      interval: row.interval,
      durationMonths: Number(row.durationMonths || (row.interval === "year" ? 12 : 1)),
      priceQar: Number(row.priceQar || 0),
      included: Array.isArray(row.included)
        ? row.included.map((inc) => ({
            serviceTypes: Array.isArray(inc.serviceTypes) ? inc.serviceTypes : [],
            quota: Number(inc.quota || 0),
            bucket: String(inc.bucket || "").trim(),
          }))
        : [],
    }));
}

async function listPlans(req, res) {
  try {
    const { page = 1, limit = 50, search = "" } = req.query;
    const match = {};
    if (search) {
      match.$or = [
        { code: { $regex: search, $options: "i" } },
        { name_en: { $regex: search, $options: "i" } },
        { name_ar: { $regex: search, $options: "i" } },
      ];
    }
    const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
    const [rows, total] = await Promise.all([
      SubscriptionPlan.find(match)
        .sort({ sortOrder: 1, code: 1 })
        .skip(skip)
        .limit(Number(limit)),
      SubscriptionPlan.countDocuments(match),
    ]);
    res.json({
      plans: rows.map(serialize),
      total,
      page: Number(page),
      limit: Number(limit),
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to list plans", error: err.message });
  }
}

async function getPlan(req, res) {
  try {
    const plan = await SubscriptionPlan.findById(req.params.id);
    if (!plan) return res.status(404).json({ message: "Plan not found" });
    res.json({ plan: serialize(plan) });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch plan", error: err.message });
  }
}

async function createPlan(req, res) {
  try {
    const {
      code,
      name_en,
      name_ar,
      discountPercent,
      eligibleServiceTypes,
      intervals,
      active,
      sortOrder,
    } = req.body || {};
    if (!code || !name_en) {
      return res.status(400).json({ message: "code and name_en are required" });
    }
    const exists = await SubscriptionPlan.findOne({
      code: String(code).trim().toLowerCase(),
    });
    if (exists) return res.status(409).json({ message: "Plan code already exists" });
    const plan = await SubscriptionPlan.create({
      code: String(code).trim().toLowerCase(),
      name_en: String(name_en).trim(),
      name_ar: name_ar || "",
      discountPercent: Number(discountPercent || 0),
      eligibleServiceTypes: Array.isArray(eligibleServiceTypes)
        ? eligibleServiceTypes
        : DISCOUNT_ELIGIBLE_TYPES,
      intervals: normalizeIntervals(intervals),
      active: active !== false,
      sortOrder: Number(sortOrder || 0),
    });
    res.status(201).json({ plan: serialize(plan) });
  } catch (err) {
    res.status(500).json({ message: "Failed to create plan", error: err.message });
  }
}

async function updatePlan(req, res) {
  try {
    const plan = await SubscriptionPlan.findById(req.params.id);
    if (!plan) return res.status(404).json({ message: "Plan not found" });
    const body = req.body || {};
    if (body.name_en != null) plan.name_en = String(body.name_en).trim();
    if (body.name_ar != null) plan.name_ar = String(body.name_ar);
    if (body.discountPercent != null) plan.discountPercent = Number(body.discountPercent);
    if (Array.isArray(body.eligibleServiceTypes)) {
      plan.eligibleServiceTypes = body.eligibleServiceTypes;
    }
    if (Array.isArray(body.intervals)) plan.intervals = normalizeIntervals(body.intervals);
    if (body.active != null) plan.active = Boolean(body.active);
    if (body.sortOrder != null) plan.sortOrder = Number(body.sortOrder);
    if (body.code != null) plan.code = String(body.code).trim().toLowerCase();
    await plan.save();
    res.json({ plan: serialize(plan) });
  } catch (err) {
    res.status(500).json({ message: "Failed to update plan", error: err.message });
  }
}

module.exports = {
  listPlans,
  getPlan,
  createPlan,
  updatePlan,
};
