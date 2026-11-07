const mongoose = require("mongoose");
const {
  Customer,
  CustomerVehicle,
  SubscriptionPlan,
  CustomerSubscription,
} = require("../../../clicks-shared/models");
const {
  findInterval,
} = require("../../../clicks-shared/services/membershipPlans");
const { getLaunchFlags } = require("../utils/featureFlags");
const {
  getSkipcashConfig,
  formatAmount,
  isPaidStatus,
  isReusableStatus,
  buildTransactionId,
} = require("../../../clicks-shared/utils/skipcash");
const {
  createPayment,
  getPayment,
  SkipcashError,
} = require("../services/skipcashClient");
const {
  applyMembershipPayment,
  skipcashSnapshot,
} = require("../services/applyMembershipPayment");

function fetchImplFor(req) {
  return req.app.get("skipcashFetch") || fetch;
}

function serializePlan(plan) {
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
    sortOrder: o.sortOrder,
    active: o.active,
  };
}

function serializeSubscription(sub) {
  const o = sub.toObject ? sub.toObject() : sub;
  const status =
    typeof sub.resolveStatus === "function" ? sub.resolveStatus() : o.status;
  const vehicle =
    o.customer_vehicle_id && typeof o.customer_vehicle_id === "object"
      ? o.customer_vehicle_id
      : null;
  return {
    id: o._id.toString(),
    _id: o._id.toString(),
    customer_id: o.customer_id?.toString?.() || o.customer_id,
    customer_vehicle_id:
      vehicle?._id?.toString() || o.customer_vehicle_id?.toString(),
    vehicle: vehicle
      ? {
          id: vehicle._id.toString(),
          plate: vehicle.plate_number || "",
          make: vehicle.vehicle_make?.makeName || "",
          model: vehicle.vehicle_model?.modelName || "",
          year: vehicle.year || null,
        }
      : null,
    plan_id: o.plan_id?.toString?.() || o.plan_id,
    planCode: o.planCode,
    planName: o.planName,
    interval: o.interval,
    durationMonths: o.durationMonths,
    priceQar: o.priceQar,
    discountPercent: o.discountPercent,
    included: o.included || [],
    eligibleServiceTypes: o.eligibleServiceTypes || [],
    usage: o.usage || [],
    status,
    startDate: o.startDate,
    endDate: o.endDate,
    source: o.source,
    skipcash: o.skipcash || {},
  };
}

async function listPlans(req, res) {
  const { customerMembership } = getLaunchFlags();
  if (!customerMembership) {
    return res.json({ plans: [], enabled: false });
  }
  const plans = await SubscriptionPlan.find({ active: true }).sort({
    sortOrder: 1,
    code: 1,
  });
  res.json({ plans: plans.map(serializePlan), enabled: true });
}

async function listMine(req, res) {
  const { customerMembership } = getLaunchFlags();
  if (!customerMembership) {
    return res.json({ subscriptions: [], enabled: false });
  }
  const filter = { customer_id: req.user.id };
  if (req.query.vehicle_id && mongoose.isValidObjectId(req.query.vehicle_id)) {
    filter.customer_vehicle_id = req.query.vehicle_id;
  }
  const rows = await CustomerSubscription.find(filter)
    .sort({ createdAt: -1 })
    .populate({
      path: "customer_vehicle_id",
      populate: [
        { path: "vehicle_make", select: "makeName" },
        { path: "vehicle_model", select: "modelName" },
      ],
    });
  res.json({
    subscriptions: rows.map(serializeSubscription),
    enabled: true,
  });
}

async function checkout(req, res) {
  try {
    const cfg = getSkipcashConfig();
    if (!cfg.enabled) {
      return res.status(503).json({
        error: "Card payment is not available right now",
        code: "SKIPCASH_DISABLED",
      });
    }

    const { plan_id, interval, customer_vehicle_id } = req.body || {};
    if (!["month", "year"].includes(interval)) {
      return res.status(400).json({
        error: "interval must be month or year",
        code: "MEMBERSHIP_INTERVAL_REQUIRED",
      });
    }
    if (!mongoose.isValidObjectId(plan_id) || !mongoose.isValidObjectId(customer_vehicle_id)) {
      return res.status(400).json({
        error: "plan_id and customer_vehicle_id are required",
        code: "MEMBERSHIP_CHECKOUT_INVALID",
      });
    }

    const customerId = req.user.id;
    const vehicle = await CustomerVehicle.findOne({
      _id: customer_vehicle_id,
      customer_id: customerId,
    });
    if (!vehicle) {
      return res.status(404).json({
        error: "Vehicle not found",
        code: "SERVICE_VEHICLE_NOT_FOUND",
      });
    }

    const plan = await SubscriptionPlan.findOne({ _id: plan_id, active: true });
    if (!plan) {
      return res.status(404).json({
        error: "Plan not found",
        code: "MEMBERSHIP_PLAN_NOT_FOUND",
      });
    }
    const sku = findInterval(plan, interval);
    if (!sku) {
      return res.status(400).json({
        error: "This plan does not offer that billing interval",
        code: "MEMBERSHIP_INTERVAL_UNAVAILABLE",
      });
    }

    const active = await CustomerSubscription.findOne({
      customer_vehicle_id: vehicle._id,
      status: "active",
    });
    if (active) {
      const resolved = active.resolveStatus();
      if (resolved === "active") {
        return res.status(409).json({
          error: "This vehicle already has an active membership",
          code: "MEMBERSHIP_ALREADY_ACTIVE",
          subscription_id: active._id.toString(),
        });
      }
      if (resolved === "expired") {
        active.status = "expired";
        await active.save();
      }
    }

    await CustomerSubscription.updateMany(
      {
        customer_vehicle_id: vehicle._id,
        status: "pending_payment",
      },
      { $set: { status: "cancelled" } }
    );

    const amount = formatAmount(sku.priceQar);
    if (!amount) {
      return res.status(400).json({
        error: "This plan has no amount to collect",
        code: "SKIPCASH_INVALID_AMOUNT",
      });
    }

    const sub = await CustomerSubscription.create({
      customer_id: customerId,
      customer_vehicle_id: vehicle._id,
      plan_id: plan._id,
      planCode: plan.code,
      planName: plan.name_en,
      interval,
      durationMonths: sku.durationMonths,
      priceQar: sku.priceQar,
      discountPercent: plan.discountPercent,
      included: sku.included || [],
      eligibleServiceTypes: plan.eligibleServiceTypes || [],
      status: "pending_payment",
      source: "app",
    });

    const customer = await Customer.findById(customerId);
    const created = await createPayment(
      {
        amount,
        customer,
        job: { _id: sub._id, clientName: `${customer?.first_name || ""} ${customer?.last_name || ""}`.trim() },
        transactionId: buildTransactionId(sub._id),
        custom1: sub._id.toString(),
        custom2: "membership",
        subject: `Clicks ${plan.name_en} membership`,
        description: `${plan.code} ${interval}`,
      },
      { fetchImpl: fetchImplFor(req) }
    );

    if (!created.payUrl) {
      return res.status(502).json({
        error: "SkipCash did not return a payment URL",
        code: "SKIPCASH_NO_PAY_URL",
      });
    }

    const snap = skipcashSnapshot(created, amount);
    sub.skipcash = snap;
    await sub.save();

    if (isPaidStatus(created.statusId)) {
      const settled = await applyMembershipPayment(sub, { skipcash: snap, amount });
      return res.json({
        already_paid: true,
        payment_status: "paid",
        subscription: serializeSubscription(settled.subscription),
      });
    }

    return res.json({
      already_paid: false,
      pay_url: created.payUrl,
      payment_id: created.id,
      amount,
      currency: created.currency || "QAR",
      return_url: cfg.returnUrl,
      subscription_id: sub._id.toString(),
    });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({
      error: err.message || "Failed to start membership checkout",
      code: err.code || "MEMBERSHIP_CHECKOUT_FAILED",
    });
  }
}

async function getStatus(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({ error: "Membership not found" });
    }
    const sub = await CustomerSubscription.findOne({
      _id: id,
      customer_id: req.user.id,
    }).populate({
      path: "customer_vehicle_id",
      populate: [
        { path: "vehicle_make", select: "makeName" },
        { path: "vehicle_model", select: "modelName" },
      ],
    });
    if (!sub) return res.status(404).json({ error: "Membership not found" });

    const resolved = sub.resolveStatus();
    if (resolved === "active") {
      return res.json({
        payment_status: "paid",
        status: "active",
        subscription: serializeSubscription(sub),
      });
    }

    const paymentId = sub.skipcash?.payment_id;
    if (!paymentId) {
      return res.json({
        payment_status: "unpaid",
        status: resolved,
        subscription: serializeSubscription(sub),
      });
    }

    const amount = formatAmount(sub.priceQar);
    const remote = await getPayment(paymentId, { fetchImpl: fetchImplFor(req) });
    if (isPaidStatus(remote.statusId)) {
      const settled = await applyMembershipPayment(sub, {
        skipcash: skipcashSnapshot(remote, amount),
        amount,
      });
      return res.json({
        payment_status: "paid",
        status: settled.subscription.status,
        subscription: serializeSubscription(settled.subscription),
      });
    }

    if (isReusableStatus(remote.statusId) && remote.payUrl) {
      sub.skipcash = {
        ...(sub.skipcash?.toObject?.() || sub.skipcash || {}),
        ...skipcashSnapshot(remote, amount),
      };
      await sub.save();
    }

    return res.json({
      payment_status: "unpaid",
      status: sub.resolveStatus(),
      skipcash_status_id: remote.statusId,
      subscription: serializeSubscription(sub),
    });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({
      error: err.message || "Failed to check membership status",
      code: err.code || "MEMBERSHIP_STATUS_FAILED",
    });
  }
}

async function cancelMine(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({ error: "Membership not found" });
    }
    const sub = await CustomerSubscription.findOne({
      _id: id,
      customer_id: req.user.id,
    });
    if (!sub) return res.status(404).json({ error: "Membership not found" });
    if (sub.status === "cancelled") {
      return res.json({
        message: "Membership already cancelled",
        subscription: serializeSubscription(sub),
      });
    }
    sub.status = "cancelled";
    await sub.save();
    return res.json({
      message: "Membership cancelled",
      subscription: serializeSubscription(sub),
    });
  } catch (err) {
    return res.status(500).json({
      error: "Failed to cancel membership",
      details: err.message,
    });
  }
}

module.exports = {
  listPlans,
  listMine,
  checkout,
  getStatus,
  cancelMine,
  serializePlan,
  serializeSubscription,
};
