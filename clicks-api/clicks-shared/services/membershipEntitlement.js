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

function usedFor(sub, includedRow) {
  const key = usageKey(includedRow);
  const usage = Array.isArray(sub?.usage) ? sub.usage : [];
  const hit = usage.find(
    (u) =>
      (u.bucket && u.bucket === key) ||
      (u.serviceType && u.serviceType === key)
  );
  return Number(hit?.used || 0);
}

function remainingQuota(sub, includedRow) {
  if (!includedRow) return 0;
  return Math.max(0, Number(includedRow.quota || 0) - usedFor(sub, includedRow));
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

async function resolveCover({ customerId, vehicleId, serviceType }) {
  const none = { cover: "none", discountPercent: 0, subscription: null };
  if (isEmergencyServiceType(serviceType)) return none;
  const sub = await getActiveForVehicle(customerId, vehicleId);
  if (!sub) return none;

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

async function consumeOnComplete(job) {
  const membership = job?.membership;
  if (!membership || membership.cover !== "included") return false;
  if (membership.consumedAt) return false;
  const subId = membership.subscription_id;
  if (!subId) return false;

  const sub = await CustomerSubscription.findById(subId);
  if (!sub || sub.resolveStatus() !== "active") return false;

  const candidates = [job.issue, job.jobType].map((v) => String(v || "").trim()).filter(Boolean);
  let includedRow = null;
  for (const serviceType of candidates) {
    includedRow = findIncludedRow(sub, serviceType);
    if (includedRow) break;
  }
  if (!includedRow) return false;

  const key = usageKey(includedRow);
  const usage = Array.isArray(sub.usage) ? [...sub.usage] : [];
  const idx = usage.findIndex(
    (u) =>
      (u.bucket && u.bucket === key) ||
      (u.serviceType && u.serviceType === key)
  );
  if (idx >= 0) {
    usage[idx].used = Number(usage[idx].used || 0) + 1;
  } else {
    usage.push({
      bucket: includedRow.bucket || "",
      serviceType: includedRow.bucket ? "" : key,
      used: 1,
    });
  }
  sub.usage = usage;
  sub.markModified("usage");
  await sub.save();

  const Job = require("../models/Job");
  const consumedAt = new Date();
  if (job._id) {
    await Job.updateOne(
      { _id: job._id, "membership.consumedAt": null },
      { $set: { "membership.consumedAt": consumedAt } }
    );
  }
  if (job.membership) job.membership.consumedAt = consumedAt;
  return true;
}

async function activateSubscription(sub, skipcashSnap, now = new Date()) {
  if (!sub) return null;
  if (skipcashSnap) {
    sub.skipcash = {
      ...(sub.skipcash?.toObject?.() || sub.skipcash || {}),
      ...skipcashSnap,
    };
  }
  const status = sub.resolveStatus(now);
  if (status === "active") {
    await sub.save();
    return sub;
  }
  if (status === "cancelled" || status === "expired") {
    await sub.save();
    return sub;
  }
  const start = now;
  sub.status = "active";
  sub.startDate = start;
  sub.endDate = periodEnd(start, sub.durationMonths);
  sub.usage = [];
  await sub.save();
  return sub;
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
};
