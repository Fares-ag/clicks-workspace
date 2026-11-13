const { SubscriptionPlan, CustomerSubscription } = require("../../../clicks-shared/models");
const {
  DISCOUNT_ELIGIBLE_TYPES,
  SERVICE_TAB_TYPES,
} = require("../../../clicks-shared/services/membershipPlans");
const { isEmergencyServiceType } = require("../../../clicks-shared/services/membershipEntitlement");
const { recordAudit } = require("../utils/auditLog");

const CODE_RE = /^[a-z0-9][a-z0-9-]{1,31}$/;
const MAX_PRICE_QAR = 100000;
const MAX_QUOTA = 1000;

function cleanTypes(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map((t) => String(t ?? "").trim()).filter(Boolean))];
}

/**
 * Every problem with a plan at once, so the admin fixes them in one pass.
 * Only the groups in `check` are validated: an update that only switches a
 * plan off must not be blocked by an older field on it.
 */
function planProblems(p, check = { identity: true, pricing: true, intervals: true, active: true }) {
  const errors = [];
  if (check.identity) {
    if (!CODE_RE.test(String(p.code || ""))) {
      errors.push("Code must be 2-32 lowercase letters, digits or dashes (e.g. plus, gold-2026)");
    }
    if (!String(p.name_en || "").trim()) errors.push("English name is required");
  }
  if (check.pricing) {
    const d = Number(p.discountPercent);
    if (!Number.isFinite(d) || d < 0 || d > 100) {
      errors.push("Discount must be between 0 and 100%");
    }
  }
  if (check.intervals) {
    const seen = new Set();
    for (const row of p.intervals || []) {
      const label = row.interval === "year" ? "Yearly" : "Monthly";
      if (seen.has(row.interval)) errors.push(`${label} billing is listed twice`);
      seen.add(row.interval);
      if (!Number.isInteger(row.durationMonths) || row.durationMonths < 1 || row.durationMonths > 60) {
        errors.push(`${label}: duration must be a whole number of months, 1-60`);
      }
      if (!Number.isFinite(row.priceQar) || row.priceQar <= 0 || row.priceQar > MAX_PRICE_QAR) {
        errors.push(`${label}: price must be more than 0 QAR (checkout cannot collect 0)`);
      }
      const buckets = new Set();
      for (const inc of row.included || []) {
        if (!inc.serviceTypes.length) {
          errors.push(`${label}: every included item needs at least one service`);
        }
        if (!Number.isInteger(inc.quota) || inc.quota < 1 || inc.quota > MAX_QUOTA) {
          errors.push(`${label}: included quantity must be a whole number, 1-${MAX_QUOTA}`);
        }
        // Usage is counted per bucket (or the first service when blank), so
        // two items sharing a key would share one counter.
        const key = String(inc.bucket || inc.serviceTypes[0] || "").trim();
        if (key && buckets.has(key)) {
          errors.push(`${label}: two included items share the counter "${key}"; give each its own`);
        }
        buckets.add(key);
      }
    }
  }
  if (check.active && p.active && !(p.intervals || []).length) {
    errors.push("An active plan needs at least one billing option (monthly or yearly)");
  }
  return errors;
}

function invalid(res, errors) {
  return res.status(400).json({ message: errors[0], errors, code: "INVALID_PLAN" });
}

/** plan_id -> members whose membership is active right now. */
async function activeMemberCounts(planIds) {
  if (!planIds.length) return new Map();
  const now = new Date();
  const rows = await CustomerSubscription.aggregate([
    { $match: { plan_id: { $in: planIds }, status: "active", endDate: { $gt: now } } },
    { $group: { _id: "$plan_id", n: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.n]));
}

function serialize(plan, activeMembers) {
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
    coversEmergency: o.coversEmergency === true,
    active: o.active,
    sortOrder: o.sortOrder,
    ...(activeMembers != null ? { activeMembers } : {}),
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
            serviceTypes: cleanTypes(inc?.serviceTypes),
            quota: Number(inc?.quota || 0),
            bucket: String(inc?.bucket || "").trim(),
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
    const members = await activeMemberCounts(rows.map((r) => r._id));
    res.json({
      plans: rows.map((r) => serialize(r, members.get(String(r._id)) || 0)),
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
    const members = await activeMemberCounts([plan._id]);
    res.json({ plan: serialize(plan, members.get(String(plan._id)) || 0) });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch plan", error: err.message });
  }
}

/** GET /meta: the service names a plan can reference, for the admin editor. */
function getPlanMeta(_req, res) {
  res.json({
    serviceTypes: SERVICE_TAB_TYPES,
    defaultDiscountServiceTypes: DISCOUNT_ELIGIBLE_TYPES,
    emergencyServiceTypes: SERVICE_TAB_TYPES.filter((t) => isEmergencyServiceType(t)),
    limits: { maxPriceQar: MAX_PRICE_QAR, maxQuota: MAX_QUOTA, maxDurationMonths: 60 },
  });
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
      coversEmergency,
    } = req.body || {};
    if (!code || !name_en) {
      return res.status(400).json({ message: "code and name_en are required" });
    }
    const fields = {
      code: String(code).trim().toLowerCase(),
      name_en: String(name_en).trim(),
      name_ar: name_ar || "",
      discountPercent: Number(discountPercent || 0),
      eligibleServiceTypes: Array.isArray(eligibleServiceTypes)
        ? cleanTypes(eligibleServiceTypes)
        : DISCOUNT_ELIGIBLE_TYPES,
      intervals: normalizeIntervals(intervals),
      active: active !== false,
      sortOrder: Number(sortOrder || 0),
      coversEmergency: coversEmergency === true,
    };
    const problems = planProblems(fields);
    if (problems.length) return invalid(res, problems);
    const exists = await SubscriptionPlan.findOne({ code: fields.code });
    if (exists) return res.status(409).json({ message: "Plan code already exists" });
    const plan = await SubscriptionPlan.create(fields);
    await recordAudit({
      req,
      action: "membership_plan.create",
      entityType: "subscription_plan",
      entityId: plan._id,
      changes: { code: plan.code, coversEmergency: plan.coversEmergency },
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
      plan.eligibleServiceTypes = cleanTypes(body.eligibleServiceTypes);
    }
    if (Array.isArray(body.intervals)) plan.intervals = normalizeIntervals(body.intervals);
    if (body.active != null) plan.active = Boolean(body.active);
    if (body.sortOrder != null) plan.sortOrder = Number(body.sortOrder) || 0;
    if (body.code != null) plan.code = String(body.code).trim().toLowerCase();
    const coversBefore = plan.coversEmergency === true;
    if (body.coversEmergency != null) plan.coversEmergency = body.coversEmergency === true;

    // Validate what this request touches. Switching a plan off is always
    // allowed; switching one on needs a billing option to sell.
    const intervalsTouched = Array.isArray(body.intervals);
    const problems = planProblems(plan.toObject(), {
      identity: body.code != null || body.name_en != null,
      pricing: body.discountPercent != null,
      intervals: intervalsTouched,
      active: (body.active != null && plan.active) || intervalsTouched,
    });
    if (problems.length) return invalid(res, problems);
    if (body.code != null && plan.isModified("code")) {
      const clash = await SubscriptionPlan.findOne({ code: plan.code, _id: { $ne: plan._id } });
      if (clash) return res.status(409).json({ message: "Plan code already exists" });
    }

    const changedFields = plan.modifiedPaths();
    await plan.save();
    if (changedFields.length) {
      await recordAudit({
        req,
        action: "membership_plan.update",
        entityType: "subscription_plan",
        entityId: plan._id,
        changes: {
          fields: changedFields,
          ...(coversBefore !== (plan.coversEmergency === true)
            ? { coversEmergency: { from: coversBefore, to: plan.coversEmergency === true } }
            : {}),
        },
      });
    }
    res.json({ plan: serialize(plan) });
  } catch (err) {
    res.status(500).json({ message: "Failed to update plan", error: err.message });
  }
}

module.exports = {
  listPlans,
  getPlan,
  getPlanMeta,
  createPlan,
  updatePlan,
};
