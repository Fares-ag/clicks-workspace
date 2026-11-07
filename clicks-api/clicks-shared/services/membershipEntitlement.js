const mongoose = require("mongoose");
const CustomerSubscription = require("../models/CustomerSubscription");
const { addMonths } = require("./membershipPlans");

const SOS_OR_EMERGENCY = new Set([
  "SOS",
  "sos",
  "Towing",
  "Jump Start",
  "Jump start",
  "Breakdown Vehicle",
]);

function isEmergencyServiceType(serviceType) {
  const t = String(serviceType || "").trim();
  if (!t) return false;
  if (SOS_OR_EMERGENCY.has(t)) return true;
  const lower = t.toLowerCase();
  return lower.includes("sos") || lower === "towing" || lower === "jump start";
}

function usageKey(includedRow) {
  return String(includedRow.bucket || includedRow.serviceTypes?.[0] || "").trim();
}

function findIncludedRow(sub, serviceType) {
  const type = String(serviceType || "").trim();
  const rows = Array.isArray(sub?.included) ? sub.included : [];
  return (
    rows.find((row) =>
      (row.serviceTypes || []).some((t) => String(t).trim() === type)
    ) || null
  );
}

function usageMatches(u, key) {
  return Boolean(
    u && ((u.bucket && u.bucket === key) || (u.serviceType && u.serviceType === key))
  );
}

function usageIndex(sub, key) {
  const usage = Array.isArray(sub?.usage) ? sub.usage : [];
  return usage.findIndex((u) => usageMatches(u, key));
}

function usedFor(sub, includedRow) {
  const key = usageKey(includedRow);
  const usage = Array.isArray(sub?.usage) ? sub.usage : [];
  const hit = usage.find((u) => usageMatches(u, key));
  return Number(hit?.used || 0);
}

function reservedFor(sub, includedRow) {
  const key = usageKey(includedRow);
  const usage = Array.isArray(sub?.usage) ? sub.usage : [];
  const hit = usage.find((u) => usageMatches(u, key));
  return Number(hit?.reserved || 0);
}

/** Quota still free: neither used by completed jobs nor held by open ones. */
function remainingQuota(sub, includedRow) {
  if (!includedRow) return 0;
  return Math.max(
    0,
    Number(includedRow.quota || 0) - usedFor(sub, includedRow) - reservedFor(sub, includedRow)
  );
}

function isDiscountEligible(sub, serviceType) {
  const type = String(serviceType || "").trim();
  const list = Array.isArray(sub?.eligibleServiceTypes)
    ? sub.eligibleServiceTypes
    : [];
  return list.includes(type);
}

function serializeCover(cover) {
  if (!cover || cover.cover === "none") {
    return {
      cover: "none",
      discountPercent: 0,
      included: false,
      subscription_id: null,
      planCode: "",
      planName: "",
    };
  }
  return {
    cover: cover.cover,
    discountPercent: Number(cover.discountPercent || 0),
    included: cover.cover === "included",
    subscription_id: cover.subscription?._id || cover.subscription_id || null,
    planCode: cover.subscription?.planCode || "",
    planName: cover.subscription?.planName || "",
  };
}

async function expireStale(sub, now = new Date()) {
  if (!sub) return sub;
  if (sub.status === "active" && sub.endDate && new Date(sub.endDate) < now) {
    sub.status = "expired";
    await sub.save();
  }
  return sub;
}

async function getActiveForVehicle(customerId, vehicleId) {
  if (!customerId || !vehicleId) return null;
  if (
    !mongoose.isValidObjectId(customerId) ||
    !mongoose.isValidObjectId(vehicleId)
  ) {
    return null;
  }
  const sub = await CustomerSubscription.findOne({
    customer_id: customerId,
    customer_vehicle_id: vehicleId,
    status: "active",
  });
  return expireStale(sub);
}

/**
 * Emergency types are covered only when the admin enabled `coversEmergency`
 * on the plan (or on this one subscription). Default false = never covered.
 */
async function subscriptionCoversEmergency(sub) {
  if (!sub) return false;
  if (sub.coversEmergency === true || sub.coversEmergency === false) {
    return sub.coversEmergency;
  }
  if (!sub.plan_id) return false;
  const SubscriptionPlan = require("../models/SubscriptionPlan");
  const plan = await SubscriptionPlan.findById(sub.plan_id).select("coversEmergency").lean();
  return plan?.coversEmergency === true;
}

async function resolveCover({ customerId, vehicleId, serviceType }) {
  const none = { cover: "none", discountPercent: 0, subscription: null };
  const sub = await getActiveForVehicle(customerId, vehicleId);
  if (!sub) return none;
  if (isEmergencyServiceType(serviceType) && !(await subscriptionCoversEmergency(sub))) {
    return none;
  }

  const includedRow = findIncludedRow(sub, serviceType);
  if (includedRow && remainingQuota(sub, includedRow) > 0) {
    return {
      cover: "included",
      discountPercent: 0,
      subscription: sub,
      includedRow,
    };
  }
  if (
    Number(sub.discountPercent || 0) > 0 &&
    isDiscountEligible(sub, serviceType)
  ) {
    return {
      cover: "discounted",
      discountPercent: Number(sub.discountPercent),
      subscription: sub,
    };
  }
  return none;
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function adjustPricing(priced, membership) {
  const snap = membership
    ? {
        cover: membership.cover || "none",
        discountPercent: Number(membership.discountPercent || 0),
        included: membership.cover === "included" || membership.included === true,
        subscription_id: membership.subscription_id || null,
      }
    : { cover: "none", discountPercent: 0, included: false, subscription_id: null };

  const kind = snap.cover || "none";
  if (kind === "included") {
    const extrasTotal = roundMoney(priced.repairsTotal || 0);
    return {
      ...priced,
      basePrice: 0,
      distanceFee: 0,
      timeFee: 0,
      serviceCharge: 0,
      subtotal: extrasTotal,
      tax: 0,
      total: extrasTotal,
      profit: roundMoney(extrasTotal - Number(priced.costTotal || 0)),
      membership: snap,
    };
  }
  if (kind === "discounted") {
    const pct = Math.min(100, Math.max(0, snap.discountPercent));
    const total = roundMoney(Number(priced.total || 0) * (1 - pct / 100));
    return {
      ...priced,
      total,
      profit: roundMoney(total - Number(priced.costTotal || 0)),
      membership: snap,
    };
  }
  return {
    ...priced,
    membership: { cover: "none", discountPercent: 0, included: false, subscription_id: null },
  };
}

function applyToPricing(job, repairs, cover, computeJobPricing) {
  const membership = cover ? serializeCover(cover) : job?.membership;
  const jobWithCover = { ...(job?.toObject?.() || job || {}), membership };
  return computeJobPricing(jobWithCover, repairs);
}

function sessionOpts(session, extra = {}) {
  return session ? { ...extra, session } : extra;
}

function jobServiceCandidates(job) {
  return [job?.issue, job?.jobType].map((v) => String(v || "").trim()).filter(Boolean);
}

/**
 * Service types to match a job against plan rows. The linked service
 * request's `service_type` comes first: job.issue is canonicalised on save
 * ("Car Wash - Exterior" becomes "Car wash"), so it no longer matches the
 * plan's exact service-type names.
 */
async function jobServiceTypes(job, session = null) {
  const list = [];
  if (job?.service_request_id) {
    try {
      const ServiceRequest = require("../models/ServiceRequest");
      const sr = await ServiceRequest.findById(job.service_request_id)
        .select("service_type")
        .session(session)
        .lean();
      if (sr?.service_type) list.push(String(sr.service_type).trim());
    } catch (err) {
      console.error("membership service type lookup failed:", err.message);
    }
  }
  for (const t of jobServiceCandidates(job)) if (!list.includes(t)) list.push(t);
  return list;
}

function includedRowFor(sub, serviceTypes) {
  for (const serviceType of serviceTypes) {
    const row = findIncludedRow(sub, serviceType);
    if (row) return row;
  }
  return null;
}

async function ensureUsageRow(subId, includedRow, session) {
  const key = usageKey(includedRow);
  await CustomerSubscription.updateOne(
    {
      _id: subId,
      usage: {
        $not: { $elemMatch: { $or: [{ bucket: key }, { serviceType: key }] } },
      },
    },
    {
      $push: {
        usage: {
          bucket: includedRow.bucket || "",
          serviceType: includedRow.bucket ? "" : key,
          used: 0,
          reserved: 0,
        },
      },
    },
    sessionOpts(session)
  );
}

/**
 * Filter: usage[idx] still has exactly these counters (missing counts as 0).
 * Must be $expr: a dotted "usage.0.reserved" query is ambiguous in MongoDB
 * (index 0, or a field named "0" in every element), so a null/0 match on it
 * is always true and would let concurrent writers all "win".
 */
function usageCountersAre(idx, used, reserved) {
  const field = (name) => ({
    $let: {
      vars: { row: { $arrayElemAt: [{ $ifNull: ["$usage", []] }, idx] } },
      in: { $ifNull: [`$$row.${name}`, 0] },
    },
  });
  return {
    $expr: {
      $and: [
        { $gt: [{ $size: { $ifNull: ["$usage", []] } }, idx] },
        { $eq: [field("used"), used] },
        { $eq: [field("reserved"), reserved] },
      ],
    },
  };
}

/** Job keeps no free visit: fall back to the member discount, or no cover. */
async function downgradeJobCover(job, sub, session, serviceTypes) {
  const Job = require("../models/Job");
  const candidates = serviceTypes || jobServiceCandidates(job);
  const discount =
    sub &&
    sub.resolveStatus?.() === "active" &&
    Number(sub.discountPercent || 0) > 0 &&
    candidates.some((t) => isDiscountEligible(sub, t))
      ? Number(sub.discountPercent)
      : 0;
  const membership = {
    cover: discount > 0 ? "discounted" : "none",
    discountPercent: discount,
    included: false,
    subscription_id: discount > 0 ? sub._id : null,
    consumedAt: null,
    reserved_at: null,
    reserved_key: "",
    released_at: null,
  };
  if (job._id) {
    await Job.updateOne({ _id: job._id }, { $set: { membership } }, sessionOpts(session));
  }
  if (job.membership && typeof job.membership.set === "function") {
    job.membership.set(membership);
  } else {
    job.membership = membership;
  }
  return { reserved: false, downgradedTo: membership.cover };
}

/**
 * Hold one included visit for this job at creation, atomically: the counters
 * read are the counters the write is conditioned on, so two jobs racing for
 * the last free visit cannot both get it (used + reserved < quota). When
 * nothing is left the job is re-stamped as discounted (or not covered) before
 * anyone prices it. Never throws — job creation must not fail on membership.
 */
async function reserveMembershipQuota(job, { session = null } = {}) {
  try {
    const mem = job?.membership;
    if (!job?._id || !mem || mem.cover !== "included" || !mem.subscription_id) {
      return { reserved: false, reason: "not_included" };
    }
    if (mem.reserved_at) return { reserved: true, reason: "already_reserved" };

    const Job = require("../models/Job");
    const types = await jobServiceTypes(job, session);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const sub = await CustomerSubscription.findById(mem.subscription_id).session(session);
      if (!sub || sub.resolveStatus() !== "active") {
        return downgradeJobCover(job, sub, session, types);
      }
      const includedRow = includedRowFor(sub, types);
      if (!includedRow) return downgradeJobCover(job, sub, session, types);
      const key = usageKey(includedRow);
      const idx = usageIndex(sub, key);
      if (idx < 0) {
        await ensureUsageRow(sub._id, includedRow, session);
        continue;
      }
      const row = sub.usage[idx];
      const used = Number(row.used || 0);
      const reserved = Number(row.reserved || 0);
      if (used + reserved >= Number(includedRow.quota || 0)) {
        return downgradeJobCover(job, sub, session, types);
      }
      const res = await CustomerSubscription.updateOne(
        { _id: sub._id, ...usageCountersAre(idx, used, reserved) },
        { $set: { [`usage.${idx}.reserved`]: reserved + 1 } },
        sessionOpts(session)
      );
      if (res.modifiedCount === 1) {
        const at = new Date();
        await Job.updateOne(
          { _id: job._id },
          { $set: { "membership.reserved_at": at, "membership.reserved_key": key } },
          sessionOpts(session)
        );
        if (job.membership) {
          job.membership.reserved_at = at;
          job.membership.reserved_key = key;
        }
        return { reserved: true, key };
      }
    }
    const sub = await CustomerSubscription.findById(mem.subscription_id).session(session);
    return downgradeJobCover(job, sub, session, types);
  } catch (err) {
    console.error("reserveMembershipQuota failed:", err.message);
    return { reserved: false, reason: "error", error: err.message };
  }
}

/**
 * Give back the visit held by a job that will not be completed (cancel).
 * Idempotent: the job-level claim on `released_at` runs once.
 */
// INTEGRATION(ws-a): call releaseMembershipQuota(job) from the shared cancel service.
async function releaseMembershipQuota(job, { session = null } = {}) {
  const Job = require("../models/Job");
  if (!job?._id) return false;
  const claimed = await Job.findOneAndUpdate(
    {
      _id: job._id,
      "membership.reserved_at": { $ne: null },
      "membership.consumedAt": null,
      "membership.released_at": null,
    },
    { $set: { "membership.released_at": new Date() } },
    sessionOpts(session, { new: true })
  );
  if (!claimed) return false;
  const key = claimed.membership?.reserved_key;
  const subId = claimed.membership?.subscription_id;
  if (job.membership) job.membership.released_at = claimed.membership.released_at;
  if (!key || !subId) return true;
  await CustomerSubscription.updateOne(
    {
      _id: subId,
      usage: {
        $elemMatch: { $or: [{ bucket: key }, { serviceType: key }], reserved: { $gt: 0 } },
      },
    },
    { $inc: { "usage.$.reserved": -1 } },
    sessionOpts(session)
  );
  return true;
}

/**
 * Count the included visit as used. A reservation taken at job creation is
 * converted (reserved -1, used +1); a job without one (created before
 * reservations existed) increments `used` directly. Runs once per job.
 */
async function consumeOnComplete(job, { session = null } = {}) {
  const membership = job?.membership;
  if (!membership || membership.cover !== "included") return false;
  if (membership.consumedAt) return false;
  const subId = membership.subscription_id;
  if (!subId || !job._id) return false;

  const Job = require("../models/Job");
  const consumedAt = new Date();
  const claimed = await Job.findOneAndUpdate(
    { _id: job._id, "membership.consumedAt": null },
    { $set: { "membership.consumedAt": consumedAt } },
    sessionOpts(session, { new: true })
  );
  if (!claimed) return false;
  if (job.membership) job.membership.consumedAt = consumedAt;

  const held = claimed.membership;
  if (held?.reserved_at && !held.released_at && held.reserved_key) {
    const converted = await CustomerSubscription.updateOne(
      {
        _id: subId,
        usage: {
          $elemMatch: {
            $or: [{ bucket: held.reserved_key }, { serviceType: held.reserved_key }],
            reserved: { $gt: 0 },
          },
        },
      },
      { $inc: { "usage.$.used": 1, "usage.$.reserved": -1 } },
      sessionOpts(session)
    );
    if (converted.modifiedCount === 1) return true;
  }

  const sub = await CustomerSubscription.findById(subId).session(session);
  if (!sub || (!held?.reserved_at && sub.resolveStatus() !== "active")) return false;
  const includedRow = includedRowFor(sub, await jobServiceTypes(job, session));
  if (!includedRow) return false;
  const key = usageKey(includedRow);
  await ensureUsageRow(sub._id, includedRow, session);
  await CustomerSubscription.updateOne(
    { _id: sub._id, usage: { $elemMatch: { $or: [{ bucket: key }, { serviceType: key }] } } },
    { $inc: { "usage.$.used": 1 } },
    sessionOpts(session)
  );
  return true;
}

/** Deliberate cancellations that a late payment must never revive. */
const FINAL_CANCEL_REASONS = new Set(["account_deleted", "admin", "fraud"]);

function pushHistory(sub, action, extra = {}) {
  const row = { action, at: new Date(), by_type: "system", ...extra };
  sub.history = [...(sub.history || []), row].slice(-100);
}

/**
 * A captured membership payment. Activates the subscription — even one an
 * older checkout marked cancelled before it was paid — unless the vehicle
 * already has a different active membership, or this one was deliberately
 * cancelled (account deletion, admin) or already used. Those become
 * `paid_duplicate`; the caller opens a refund case.
 *
 * @returns {Promise<{ subscription: object|null, outcome: "activated"|"already_active"|"paid_duplicate"|"missing" }>}
 */
async function activateSubscription(sub, skipcashSnap, now = new Date()) {
  if (!sub) return { subscription: null, outcome: "missing" };
  if (skipcashSnap) {
    sub.skipcash = {
      ...(sub.skipcash?.toObject?.() || sub.skipcash || {}),
      ...skipcashSnap,
    };
  }
  const status = sub.resolveStatus(now);
  if (status === "active") {
    await sub.save();
    return { subscription: sub, outcome: "already_active" };
  }
  if (status === "paid_duplicate") {
    await sub.save();
    return { subscription: sub, outcome: "paid_duplicate" };
  }

  const wasLive = Boolean(sub.startDate);
  const deliberatelyCancelled =
    status === "cancelled" && FINAL_CANCEL_REASONS.has(String(sub.cancel_reason || ""));
  let otherActive = await CustomerSubscription.findOne({
    customer_vehicle_id: sub.customer_vehicle_id,
    status: "active",
    _id: { $ne: sub._id },
  });
  if (otherActive) {
    otherActive = await expireStale(otherActive, now);
    if (otherActive.status !== "active") otherActive = null;
  }

  const markDuplicate = async (why) => {
    sub.status = "paid_duplicate";
    sub.paid_at = sub.paid_at || now;
    pushHistory(sub, "paid_duplicate", { note: why });
    await sub.save();
    return { subscription: sub, outcome: "paid_duplicate" };
  };

  if (wasLive || deliberatelyCancelled || status === "expired") {
    return markDuplicate(wasLive ? "subscription already used" : `cancelled: ${sub.cancel_reason}`);
  }
  if (otherActive) {
    return markDuplicate(`vehicle already has membership ${otherActive._id}`);
  }

  sub.status = "active";
  sub.startDate = now;
  sub.endDate = periodEnd(now, sub.durationMonths);
  sub.paid_at = now;
  sub.usage = [];
  sub.cancel_at_period_end = false;
  sub.cancelled_at = null;
  sub.cancel_reason = "";
  pushHistory(sub, "activated");
  try {
    await sub.save();
  } catch (err) {
    if (err.code !== 11000) throw err;
    // Lost the race on the one-active-per-vehicle index to another payment.
    await CustomerSubscription.updateOne(
      { _id: sub._id },
      {
        $set: {
          status: "paid_duplicate",
          paid_at: now,
          startDate: null,
          endDate: null,
          skipcash: sub.skipcash,
        },
        $push: { history: { action: "paid_duplicate", note: "activation race", at: now } },
      }
    );
    const fresh = await CustomerSubscription.findById(sub._id);
    return { subscription: fresh, outcome: "paid_duplicate" };
  }
  return { subscription: sub, outcome: "activated" };
}

function stampJobMembership(jobFields, cover) {
  const snap = serializeCover(cover);
  jobFields.membership = {
    cover: snap.cover,
    discountPercent: snap.discountPercent,
    included: snap.included,
    subscription_id: snap.subscription_id,
    consumedAt: null,
  };
  return jobFields;
}

function stampRequestMembership(fields, cover) {
  const snap = serializeCover(cover);
  fields.membership_cover = snap.cover;
  fields.membership_subscription_id = snap.subscription_id;
  fields.membership_discount_percent = snap.discountPercent;
  return fields;
}

function periodEnd(startDate, durationMonths) {
  return addMonths(startDate, durationMonths);
}

module.exports = {
  isEmergencyServiceType,
  subscriptionCoversEmergency,
  reserveMembershipQuota,
  releaseMembershipQuota,
  pushHistory,
  resolveCover,
  applyToPricing,
  adjustPricing,
  consumeOnComplete,
  activateSubscription,
  serializeCover,
  stampJobMembership,
  stampRequestMembership,
  getActiveForVehicle,
  periodEnd,
  findIncludedRow,
  remainingQuota,
  usageKey,
  usageIndex,
  usageCountersAre,
};
