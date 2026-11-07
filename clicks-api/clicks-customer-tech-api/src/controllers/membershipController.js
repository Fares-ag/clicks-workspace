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
  amountsMatch,
  isPaidStatus,
  isReusableStatus,
  buildTransactionId,
} = require("../../../clicks-shared/utils/skipcash");
const {
  createPayment,
  getPayment,
} = require("../services/skipcashClient");
const {
  settleMembershipAttempt,
  skipcashSnapshot,
} = require("../../../clicks-shared/services/membershipPayment");
const {
  recordCreatedAttempt,
  ensureAttempt,
  pendingAttempts,
} = require("../../../clicks-shared/services/paymentAttempts");
const {
  isEmergencyServiceType,
  pushHistory,
} = require("../../../clicks-shared/services/membershipEntitlement");
const { acquireLease } = require("../../../clicks-shared/services/opsLease");

const CHECKOUT_LOCK_MS = 20 * 1000;
const EMERGENCY_TYPES = ["SOS", "Towing", "Jump Start", "Breakdown Vehicle"];

async function waitForLease(name, ttlMs, waitMs = 4000) {
  const deadline = Date.now() + waitMs;
  for (;;) {
    const lease = await acquireLease(name, ttlMs);
    if (lease) return lease;
    if (Date.now() >= deadline) return null;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

/** Plain-language coverage for the plan screen ("What's covered"). */
function coverageSummary(plan, interval) {
  const covers = plan.coversEmergency === true;
  const rows = (plan.intervals || [])
    .filter((row) => !interval || row.interval === interval)
    .map((row) => ({
      interval: row.interval,
      included: (row.included || []).map((inc) => ({
        serviceTypes: inc.serviceTypes || [],
        quota: inc.quota,
        bucket: inc.bucket || "",
      })),
    }));
  return {
    included_by_interval: rows,
    discount_percent: Number(plan.discountPercent || 0),
    discount_service_types: (plan.eligibleServiceTypes || []).filter(
      (t) => covers || !isEmergencyServiceType(t)
    ),
    covers_emergency: covers,
    excluded_service_types: covers ? [] : EMERGENCY_TYPES,
  };
}

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
    coversEmergency: o.coversEmergency === true,
    coverage: coverageSummary(o),
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
    subscription_status: status,
    startDate: o.startDate,
    endDate: o.endDate,
    source: o.source,
    cancel_at_period_end: Boolean(o.cancel_at_period_end),
    cancel_requested_at: o.cancel_requested_at || null,
    cancelled_at: o.cancelled_at || null,
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
  let lease = null;
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
    const amount = formatAmount(sku.priceQar);
    if (!amount) {
      return res.status(400).json({
        error: "This plan has no amount to collect",
        code: "SKIPCASH_INVALID_AMOUNT",
      });
    }

    // One checkout per vehicle at a time: a double tap waits for the first.
    lease = await waitForLease(`membership-checkout:${vehicle._id}`, CHECKOUT_LOCK_MS);
    if (!lease) {
      return res.status(409).json({
        error: "A membership checkout is already in progress for this vehicle",
        code: "CHECKOUT_BUSY",
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

    // Older pending checkouts are NOT cancelled: their links may still be paid
    // and must activate. Reuse the one for this plan + interval when SkipCash
    // still considers it payable.
    const fetchImpl = fetchImplFor(req);
    const pendingSubs = await CustomerSubscription.find({
      customer_vehicle_id: vehicle._id,
      status: "pending_payment",
    }).sort({ createdAt: -1 });
    for (const pending of pendingSubs) {
      const attempts = await pendingAttempts({ subscriptionId: pending._id });
      for (const attempt of attempts) {
        let remote;
        try {
          remote = await getPayment(attempt.provider_payment_id, { fetchImpl });
        } catch {
          continue;
        }
        const settled = await settleMembershipAttempt(attempt, {
          source: "checkout",
          statusId: remote.statusId,
          amount: remote.amount,
          transactionId: remote.transactionId,
          visaId: remote.visaId,
          payUrl: remote.payUrl,
        });
        if (settled.state === "paid" && settled.subscription?.status === "active") {
          return res.json({
            already_paid: true,
            payment_status: "paid",
            subscription_status: "active",
            subscription: serializeSubscription(settled.subscription),
          });
        }
        const sameSku =
          String(pending.plan_id) === String(plan._id) && pending.interval === interval;
        if (
          sameSku &&
          settled.state === "pending" &&
          isReusableStatus(remote.statusId) &&
          (remote.payUrl || attempt.pay_url) &&
          amountsMatch(attempt.amount, amount)
        ) {
          return res.json({
            already_paid: false,
            reused: true,
            pay_url: remote.payUrl || attempt.pay_url,
            payment_id: attempt.provider_payment_id,
            amount,
            currency: attempt.currency || "QAR",
            return_url: cfg.returnUrl,
            subscription_id: pending._id.toString(),
          });
        }
      }
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
      history: [{ action: "checkout_started", by_type: "customer", by_id: customerId }],
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
      { fetchImpl }
    );

    if (!created.payUrl) {
      return res.status(502).json({
        error: "SkipCash did not return a payment URL",
        code: "SKIPCASH_NO_PAY_URL",
      });
    }

    const attempt = await recordCreatedAttempt({
      kind: "membership",
      subscriptionId: sub._id,
      customerId,
      result: created,
      amount: Number(amount),
      createdBy: { type: "customer", id: customerId },
    });
    const snap = skipcashSnapshot(created, amount);
    sub.skipcash = snap;
    await sub.save();

    if (isPaidStatus(created.statusId)) {
      const settled = await settleMembershipAttempt(attempt, {
        source: "create",
        statusId: created.statusId,
        amount: created.amount || amount,
      });
      const fresh = settled.subscription || sub;
      return res.json({
        already_paid: true,
        payment_status: "paid",
        subscription_status: fresh.resolveStatus?.() || fresh.status,
        subscription: serializeSubscription(fresh),
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
  } finally {
    if (lease) await lease.release();
  }
}

function statusMessage(subStatus) {
  if (subStatus === "paid_duplicate") {
    return "Payment received. This vehicle already has a membership, so we are refunding you.";
  }
  return undefined;
}

/**
 * `subscription_status` is what the app trusts: "active" means covered.
 * `payment_status` only says whether money was captured.
 */
async function getStatus(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({ error: "Membership not found" });
    }
    const populate = {
      path: "customer_vehicle_id",
      populate: [
        { path: "vehicle_make", select: "makeName" },
        { path: "vehicle_model", select: "modelName" },
      ],
    };
    let sub = await CustomerSubscription.findOne({
      _id: id,
      customer_id: req.user.id,
    }).populate(populate);
    if (!sub) return res.status(404).json({ error: "Membership not found" });

    const respond = (subscription, extra = {}) => {
      const subStatus = subscription.resolveStatus();
      const paid = subStatus === "active" || subStatus === "paid_duplicate" || Boolean(subscription.paid_at);
      return res.json({
        payment_status: paid ? "paid" : "unpaid",
        status: subStatus,
        subscription_status: subStatus,
        message: statusMessage(subStatus),
        subscription: serializeSubscription(subscription),
        ...extra,
      });
    };

    const resolved = sub.resolveStatus();
    if (resolved !== "pending_payment" && resolved !== "cancelled") return respond(sub);

    const attempts = await pendingAttempts({ subscriptionId: sub._id });
    if (!attempts.length && sub.skipcash?.payment_id) {
      const legacy = await ensureAttempt({
        kind: "membership",
        providerPaymentId: sub.skipcash.payment_id,
        subscriptionId: sub._id,
        customerId: sub.customer_id,
        amount: Number(sub.priceQar) || 0,
      });
      if (legacy && legacy.status === "pending") attempts.push(legacy);
    }
    if (!attempts.length) return respond(sub);

    const fetchImpl = fetchImplFor(req);
    let lastStatusId = null;
    for (const attempt of attempts) {
      try {
        const remote = await getPayment(attempt.provider_payment_id, { fetchImpl });
        lastStatusId = remote.statusId;
        await settleMembershipAttempt(attempt, {
          source: "poll",
          statusId: remote.statusId,
          amount: remote.amount,
          transactionId: remote.transactionId,
          visaId: remote.visaId,
          payUrl: remote.payUrl,
        });
      } catch (lookupErr) {
        console.error("membership status lookup failed:", lookupErr.message);
      }
    }
    sub = await CustomerSubscription.findById(sub._id).populate(populate);
    return respond(sub, lastStatusId != null ? { skipcash_status_id: lastStatusId } : {});
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({
      error: err.message || "Failed to check membership status",
      code: err.code || "MEMBERSHIP_STATUS_FAILED",
    });
  }
}

/**
 * Customer cancellation: an active membership runs to the end of the period
 * it was paid for (no refund, no proration). Immediate cancellation of a paid
 * membership is a finance/admin action. A checkout that was never paid is
 * simply cancelled.
 */
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
    const status = sub.resolveStatus();
    if (status === "cancelled" || status === "expired") {
      return res.json({
        message: "Membership already ended",
        subscription: serializeSubscription(sub),
      });
    }
    if (req.body?.immediate === true || req.body?.mode === "immediate") {
      if (status === "active") {
        return res.status(403).json({
          error: "Memberships end at the close of the paid period. Contact support for an immediate cancellation.",
          code: "IMMEDIATE_CANCEL_FINANCE_ONLY",
        });
      }
    }

    if (status === "pending_payment") {
      sub.status = "cancelled";
      sub.cancelled_at = new Date();
      sub.cancel_reason = "customer_request";
      sub.cancelled_by = { type: "customer", id: req.user.id };
      pushHistory(sub, "cancelled", { by_type: "customer", by_id: req.user.id, note: "checkout abandoned" });
      await sub.save();
      return res.json({
        message: "Membership checkout cancelled",
        subscription: serializeSubscription(sub),
      });
    }
    if (status !== "active") {
      return res.status(409).json({
        error: `Cannot cancel a membership that is ${status}`,
        code: "MEMBERSHIP_NOT_CANCELLABLE",
      });
    }
    if (sub.cancel_at_period_end) {
      return res.json({
        message: "Membership will end at the close of the current period",
        subscription: serializeSubscription(sub),
      });
    }
    sub.cancel_at_period_end = true;
    sub.cancel_requested_at = new Date();
    sub.cancel_reason = "customer_request";
    sub.cancelled_by = { type: "customer", id: req.user.id };
    pushHistory(sub, "cancel_at_period_end", {
      by_type: "customer",
      by_id: req.user.id,
      note: req.body?.terms_accepted ? "terms accepted on screen" : "",
      data: { ends_at: sub.endDate },
    });
    await sub.save();
    return res.json({
      message: "Membership will end at the close of the current period",
      ends_at: sub.endDate,
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
