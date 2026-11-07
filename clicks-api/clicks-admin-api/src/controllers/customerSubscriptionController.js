const mongoose = require("mongoose");
const {
  CustomerSubscription,
  CustomerVehicle,
  SubscriptionPlan,
  Refund,
} = require("../../../clicks-shared/models");
const { findInterval, addMonths } = require("../../../clicks-shared/services/membershipPlans");
const { pushHistory } = require("../../../clicks-shared/services/membershipEntitlement");
const { requestRefund } = require("../../../clicks-shared/services/refunds");
const { recordAudit, serializeAuditValue } = require("../utils/auditLog");

const MAX_EXTEND_DAYS = 3660;

function serialize(sub) {
  const o = sub.toObject ? sub.toObject() : sub;
  const status =
    typeof sub.resolveStatus === "function" ? sub.resolveStatus() : o.status;
  const customer =
    o.customer_id && typeof o.customer_id === "object" ? o.customer_id : null;
  const vehicle =
    o.customer_vehicle_id && typeof o.customer_vehicle_id === "object"
      ? o.customer_vehicle_id
      : null;
  return {
    id: o._id.toString(),
    _id: o._id.toString(),
    status,
    interval: o.interval,
    durationMonths: o.durationMonths,
    priceQar: o.priceQar,
    planCode: o.planCode,
    planName: o.planName,
    plan_id: o.plan_id?.toString?.() || o.plan_id || null,
    discountPercent: o.discountPercent,
    included: o.included || [],
    usage: o.usage || [],
    startDate: o.startDate,
    endDate: o.endDate,
    source: o.source,
    comp: Boolean(o.comp),
    coversEmergency: o.coversEmergency ?? null,
    cancel_at_period_end: Boolean(o.cancel_at_period_end),
    cancel_requested_at: o.cancel_requested_at || null,
    cancelled_at: o.cancelled_at || null,
    cancel_reason: o.cancel_reason || "",
    paid_at: o.paid_at || null,
    refunded_amount: Number(o.refunded_amount || 0),
    history: (o.history || []).slice(-20),
    customer: customer
      ? {
          id: customer._id.toString(),
          phone: customer.phone_number || "",
          name:
            `${customer.first_name || ""} ${customer.last_name || ""}`.trim(),
        }
      : null,
    vehicle: vehicle
      ? {
          id: vehicle._id.toString(),
          plate: vehicle.plate_number || "",
        }
      : null,
    createdAt: o.createdAt,
  };
}

function badRequest(res, message, code = "INVALID") {
  return res.status(400).json({ message, code });
}

function adminActor(req) {
  return { by_type: "admin", by_id: req.user?.id || null };
}

async function loadSub(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(404).json({ message: "Membership not found" });
    return null;
  }
  const sub = await CustomerSubscription.findById(req.params.id);
  if (!sub) {
    res.status(404).json({ message: "Membership not found" });
    return null;
  }
  return sub;
}

async function respondWith(res, sub, extra = {}) {
  const fresh = await CustomerSubscription.findById(sub._id)
    .populate("customer_id", "first_name last_name phone_number")
    .populate("customer_vehicle_id", "plate_number");
  return res.json({ subscription: serialize(fresh || sub), ...extra });
}

async function listSubscriptions(req, res) {
  try {
    const { page = 1, limit = 50, search = "", status, interval } = req.query;
    const match = {};
    if (status) match.status = status;
    if (interval === "month" || interval === "year") match.interval = interval;
    if (search) {
      match.$or = [
        { planName: { $regex: search, $options: "i" } },
        { planCode: { $regex: search, $options: "i" } },
      ];
    }
    const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
    const [rows, total] = await Promise.all([
      CustomerSubscription.find(match)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("customer_id", "first_name last_name phone_number")
        .populate("customer_vehicle_id", "plate_number"),
      CustomerSubscription.countDocuments(match),
    ]);
    res.json({
      subscriptions: rows.map(serialize),
      total,
      page: Number(page),
      limit: Number(limit),
    });
  } catch (err) {
    res.status(500).json({
      message: "Failed to list customer memberships",
      error: err.message,
    });
  }
}

async function getSubscription(req, res) {
  try {
    const sub = await CustomerSubscription.findById(req.params.id)
      .populate("customer_id", "first_name last_name phone_number")
      .populate("customer_vehicle_id", "plate_number");
    if (!sub) return res.status(404).json({ message: "Membership not found" });
    const refunds = await Refund.find({ subscription_id: sub._id }).sort({ createdAt: -1 }).lean();
    res.json({ subscription: serialize(sub), refunds });
  } catch (err) {
    res.status(500).json({
      message: "Failed to fetch membership",
      error: err.message,
    });
  }
}

/** POST / — grant (comp) a membership without payment. */
async function grantSubscription(req, res) {
  try {
    const { customer_vehicle_id, plan_id, interval, months, reason, start_date } = req.body || {};
    const why = String(reason || "").trim();
    if (!why) return badRequest(res, "A reason is required to grant a membership", "REASON_REQUIRED");
    if (!mongoose.isValidObjectId(customer_vehicle_id) || !mongoose.isValidObjectId(plan_id)) {
      return badRequest(res, "customer_vehicle_id and plan_id are required");
    }
    if (!["month", "year"].includes(interval)) return badRequest(res, "interval must be month or year");
    const vehicle = await CustomerVehicle.findById(customer_vehicle_id);
    if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });
    const plan = await SubscriptionPlan.findById(plan_id);
    if (!plan) return res.status(404).json({ message: "Plan not found" });
    const sku = findInterval(plan, interval);
    if (!sku) return badRequest(res, "This plan does not offer that billing interval");
    const duration = months != null && months !== "" ? Math.trunc(Number(months)) : sku.durationMonths;
    if (!Number.isFinite(duration) || duration < 1 || duration > 60) {
      return badRequest(res, "months must be between 1 and 60");
    }
    const start = start_date ? new Date(start_date) : new Date();
    if (Number.isNaN(start.getTime())) return badRequest(res, "Invalid start_date");

    const live = await CustomerSubscription.findOne({
      customer_vehicle_id: vehicle._id,
      status: "active",
    });
    if (live && live.resolveStatus() === "active") {
      return res.status(409).json({
        message: "This vehicle already has an active membership. Extend it instead.",
        code: "MEMBERSHIP_ALREADY_ACTIVE",
        subscription_id: live._id.toString(),
      });
    }
    if (live) {
      live.status = "expired";
      await live.save();
    }

    let sub;
    try {
      sub = await CustomerSubscription.create({
        customer_id: vehicle.customer_id,
        customer_vehicle_id: vehicle._id,
        plan_id: plan._id,
        planCode: plan.code,
        planName: plan.name_en,
        interval,
        durationMonths: duration,
        priceQar: 0,
        discountPercent: plan.discountPercent,
        included: sku.included || [],
        eligibleServiceTypes: plan.eligibleServiceTypes || [],
        status: "active",
        startDate: start,
        endDate: addMonths(start, duration),
        source: "admin",
        comp: true,
        history: [{ action: "granted", ...adminActor(req), note: why, at: new Date() }],
      });
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({
          message: "This vehicle already has an active membership",
          code: "MEMBERSHIP_ALREADY_ACTIVE",
        });
      }
      throw err;
    }
    await recordAudit({
      req,
      action: "membership.grant",
      entityType: "customer_subscription",
      entityId: sub._id,
      changes: {
        plan: plan.code,
        interval,
        months: duration,
        endDate: serializeAuditValue(sub.endDate),
        reason: why,
      },
    });
    res.status(201);
    return respondWith(res, sub);
  } catch (err) {
    res.status(500).json({ message: "Failed to grant membership", error: err.message });
  }
}

/** POST /:id/extend — move the end date by days/months, or to an explicit date. */
async function extendSubscription(req, res) {
  try {
    const sub = await loadSub(req, res);
    if (!sub) return;
    const { days, months, end_date, reason } = req.body || {};
    const why = String(reason || "").trim();
    if (!why) return badRequest(res, "A reason is required", "REASON_REQUIRED");
    const status = sub.resolveStatus();
    if (!["active", "expired"].includes(status)) {
      return res.status(409).json({
        message: `Cannot extend a membership that is ${status}`,
        code: "MEMBERSHIP_NOT_EXTENDABLE",
      });
    }
    const base = sub.endDate && new Date(sub.endDate) > new Date() ? new Date(sub.endDate) : new Date();
    let next;
    if (end_date) {
      next = new Date(end_date);
      if (Number.isNaN(next.getTime()) || next <= new Date()) {
        return badRequest(res, "end_date must be a future date");
      }
    } else if (months != null && months !== "") {
      const m = Math.trunc(Number(months));
      if (!Number.isFinite(m) || m < 1 || m > 60) return badRequest(res, "months must be 1-60");
      next = addMonths(base, m);
    } else {
      const d = Math.trunc(Number(days));
      if (!Number.isFinite(d) || d < 1 || d > MAX_EXTEND_DAYS) {
        return badRequest(res, `days must be 1-${MAX_EXTEND_DAYS}`);
      }
      next = new Date(base.getTime() + d * 24 * 60 * 60 * 1000);
    }
    const before = sub.endDate;
    if (status === "expired") {
      const other = await CustomerSubscription.findOne({
        customer_vehicle_id: sub.customer_vehicle_id,
        status: "active",
        _id: { $ne: sub._id },
      });
      if (other && other.resolveStatus() === "active") {
        return res.status(409).json({
          message: "The vehicle has another active membership",
          code: "MEMBERSHIP_ALREADY_ACTIVE",
        });
      }
      sub.status = "active";
    }
    sub.endDate = next;
    pushHistory(sub, "extended", {
      ...adminActor(req),
      note: why,
      data: { from: before, to: next },
    });
    await sub.save();
    await recordAudit({
      req,
      action: "membership.extend",
      entityType: "customer_subscription",
      entityId: sub._id,
      changes: {
        endDate: { from: serializeAuditValue(before), to: serializeAuditValue(next) },
        reason: why,
      },
    });
    return respondWith(res, sub);
  } catch (err) {
    res.status(500).json({ message: "Failed to extend membership", error: err.message });
  }
}

/** POST /:id/cancel — { mode: "period_end" (default) | "immediate", reason } */
async function cancelSubscription(req, res) {
  try {
    const sub = await loadSub(req, res);
    if (!sub) return;
    const mode = req.body?.mode === "immediate" ? "immediate" : "period_end";
    const why = String(req.body?.reason || "").trim();
    if (!why) return badRequest(res, "A reason is required", "REASON_REQUIRED");
    const status = sub.resolveStatus();
    if (["cancelled", "expired"].includes(status)) {
      return res.status(409).json({ message: `Membership is already ${status}`, code: "MEMBERSHIP_ENDED" });
    }
    const before = { status: sub.status, cancel_at_period_end: sub.cancel_at_period_end };
    if (mode === "immediate" || status !== "active") {
      sub.status = "cancelled";
      sub.cancelled_at = new Date();
      sub.cancel_reason = "admin";
      sub.cancelled_by = { type: "admin", id: req.user?.id || null };
      sub.cancel_at_period_end = false;
    } else {
      sub.cancel_at_period_end = true;
      sub.cancel_requested_at = new Date();
      sub.cancel_reason = "admin";
      sub.cancelled_by = { type: "admin", id: req.user?.id || null };
    }
    pushHistory(sub, mode === "immediate" ? "cancelled" : "cancel_at_period_end", {
      ...adminActor(req),
      note: why,
    });
    await sub.save();
    await recordAudit({
      req,
      action: mode === "immediate" ? "membership.cancel_immediate" : "membership.cancel_period_end",
      entityType: "customer_subscription",
      entityId: sub._id,
      changes: {
        before,
        after: { status: sub.status, cancel_at_period_end: sub.cancel_at_period_end },
        reason: why,
      },
    });
    return respondWith(res, sub);
  } catch (err) {
    res.status(500).json({ message: "Failed to cancel membership", error: err.message });
  }
}

/** POST /:id/refund — opens a refund case (approved by someone else). */
async function refundSubscription(req, res) {
  try {
    const sub = await loadSub(req, res);
    if (!sub) return;
    const refund = await requestRefund({
      jobId: undefined,
      subscriptionId: sub._id,
      amount: req.body?.amount == null || req.body.amount === "" ? undefined : Number(req.body.amount),
      reason: req.body?.reason,
      requestedBy: { type: "admin", id: req.user?.id, role: req.user?.role },
      source: "admin",
    });
    pushHistory(sub, "refund_requested", {
      ...adminActor(req),
      note: refund.reason,
      data: { refund_id: refund._id, amount: refund.amount },
    });
    await sub.save();
    await recordAudit({
      req,
      action: "membership.refund_request",
      entityType: "customer_subscription",
      entityId: sub._id,
      changes: { refund_id: String(refund._id), amount: refund.amount, reason: refund.reason },
    });
    res.status(201);
    return respondWith(res, sub, { refund });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ message: err.message, code: err.code, error: err.message });
  }
}

/**
 * POST /:id/usage — { bucket, used?, reserved?, delta? , reason }
 * Sets the counters of one usage bucket (or adds `delta` to `used`).
 */
async function adjustUsage(req, res) {
  try {
    const sub = await loadSub(req, res);
    if (!sub) return;
    const { bucket, used, reserved, delta, reason } = req.body || {};
    const key = String(bucket || "").trim();
    const why = String(reason || "").trim();
    if (!key) return badRequest(res, "bucket is required");
    if (!why) return badRequest(res, "A reason is required", "REASON_REQUIRED");
    const known = (sub.included || []).some(
      (row) => String(row.bucket || row.serviceTypes?.[0] || "").trim() === key
    );
    if (!known) return badRequest(res, "This membership has no such bucket", "UNKNOWN_BUCKET");

    const usage = Array.isArray(sub.usage) ? sub.usage.map((u) => (u.toObject ? u.toObject() : u)) : [];
    let idx = usage.findIndex((u) => u.bucket === key || u.serviceType === key);
    if (idx < 0) {
      usage.push({ bucket: key, serviceType: "", used: 0, reserved: 0 });
      idx = usage.length - 1;
    }
    const before = { used: Number(usage[idx].used || 0), reserved: Number(usage[idx].reserved || 0) };
    const next = { ...before };
    if (delta != null && delta !== "") {
      const d = Math.trunc(Number(delta));
      if (!Number.isFinite(d)) return badRequest(res, "delta must be a number");
      next.used = before.used + d;
    }
    if (used != null && used !== "") next.used = Math.trunc(Number(used));
    if (reserved != null && reserved !== "") next.reserved = Math.trunc(Number(reserved));
    if (![next.used, next.reserved].every((n) => Number.isFinite(n) && n >= 0 && n <= 1000)) {
      return badRequest(res, "Counters must be between 0 and 1000");
    }
    usage[idx] = { ...usage[idx], used: next.used, reserved: next.reserved };

    // Conditional on the counters we read, so a job completing at the same
    // moment is not silently overwritten.
    const res2 = await CustomerSubscription.updateOne(
      {
        _id: sub._id,
        ...(idx < (sub.usage || []).length
          ? {
              [`usage.${idx}.used`]: before.used === 0 ? { $in: [0, null] } : before.used,
              [`usage.${idx}.reserved`]: before.reserved === 0 ? { $in: [0, null] } : before.reserved,
            }
          : { "usage.bucket": { $ne: key } }),
      },
      {
        $set: { usage },
        $push: {
          history: {
            action: "usage_adjusted",
            ...adminActor(req),
            note: why,
            data: { bucket: key, before, after: next },
            at: new Date(),
          },
        },
      }
    );
    if (res2.modifiedCount !== 1) {
      return res.status(409).json({
        message: "Usage changed while you were editing. Reload and try again.",
        code: "USAGE_CONFLICT",
      });
    }
    await recordAudit({
      req,
      action: "membership.usage_adjust",
      entityType: "customer_subscription",
      entityId: sub._id,
      changes: { bucket: key, before, after: next, reason: why },
    });
    return respondWith(res, sub);
  } catch (err) {
    res.status(500).json({ message: "Failed to adjust usage", error: err.message });
  }
}

module.exports = {
  listSubscriptions,
  getSubscription,
  grantSubscription,
  extendSubscription,
  cancelSubscription,
  refundSubscription,
  adjustUsage,
};
