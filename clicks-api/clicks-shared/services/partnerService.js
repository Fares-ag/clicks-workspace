/**
 * Partner accrual + Google source/subSource helpers.
 * Used by tech-api (job complete) and admin-api (partners CRUD).
 */
const Partner = require("../models/Partner");
const PartnerEarning = require("../models/PartnerEarning");
const Source = require("../models/Source");
const { ELIGIBLE_JOB_TYPES } = require("../models/Partner");

async function ensureGoogleSourceWithSubSource(partnerName) {
  const name = String(partnerName || "").trim();
  if (!name) throw new Error("partner name required for Google subSource");

  let source = await Source.findOne({ mainSourceName: "Google" });
  if (!source) {
    source = await Source.create({
      mainSourceName: "Google",
      isActive: true,
      subSources: [{ name, notes: "Partner acquisition" }],
    });
    return source;
  }

  const exists = (source.subSources || []).some(
    (s) => String(s.name).toLowerCase() === name.toLowerCase()
  );
  if (!exists) {
    source.subSources.push({ name, notes: "Partner acquisition" });
    await source.save();
  }
  return source;
}

function refreshPeriodStatus(partner) {
  if (!partner || partner.status === "inactive") return partner;
  const cap = partner.periodCap();
  const accrued = Number(partner.accruedTotal || 0);
  const now = Date.now();
  const ends = partner.periodEndsAt
    ? new Date(partner.periodEndsAt).getTime()
    : 0;

  if (accrued >= cap) {
    partner.status = "capped";
  } else if (ends && now > ends) {
    partner.status = "frozen";
  }
  return partner;
}

/**
 * Credit partner from a newly completed job (idempotent per job).
 */
async function accruePartnerFromCompletedJob(job) {
  if (!job || job.job_status !== "completed") return null;

  const jobType = String(job.jobType || "");
  if (!ELIGIBLE_JOB_TYPES.includes(jobType)) return null;

  const subSource = String(job.subSource || "").trim();
  if (!subSource) return null;

  // Need populated source or fetch
  let mainSourceName = "";
  if (job.source && typeof job.source === "object" && job.source.mainSourceName) {
    mainSourceName = job.source.mainSourceName;
  } else if (job.source) {
    const src = await Source.findById(job.source).select("mainSourceName");
    mainSourceName = src?.mainSourceName || "";
  }
  if (String(mainSourceName) !== "Google") return null;

  const existing = await PartnerEarning.findOne({ job: job._id });
  if (existing) return existing;

  let partner = await Partner.findOne({
    name: subSource,
    isActive: true,
  });
  if (!partner) {
    // case-insensitive fallback
    partner = await Partner.findOne({
      name: new RegExp(`^${subSource.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
      isActive: true,
    });
  }
  if (!partner) return null;

  refreshPeriodStatus(partner);
  if (partner.status !== "active") {
    await partner.save();
    return null;
  }

  const remaining = partner.remainingToCap();
  if (remaining <= 0) {
    partner.status = "capped";
    await partner.save();
    return null;
  }

  const price = Number(job.price || 0);
  if (price <= 0) return null;

  const credit = Math.min(price, remaining);
  partner.accruedTotal = Number(partner.accruedTotal || 0) + credit;
  if (partner.accruedTotal >= partner.periodCap()) {
    partner.status = "capped";
  }
  await partner.save();

  const earning = await PartnerEarning.create({
    partner: partner._id,
    job: job._id,
    amount: credit,
    period: partner.currentPeriod,
  });

  if (!job.partner_id || String(job.partner_id) !== String(partner._id)) {
    job.partner_id = partner._id;
    await job.save();
  }

  notifyPartnerAccrualAsync(partner, credit);

  return earning;
}

function notifyPartnerAccrualAsync(partner, amount) {
  setImmediate(() => {
    (async () => {
      const loaders = [
        () =>
          require("../../clicks-customer-tech-api/src/services/fcmService")
            .sendPartnerAccrualPush,
        () =>
          require("../../clicks-admin-api/src/services/partnerFcmService")
            .sendPartnerAccrualPush,
      ];
      for (const load of loaders) {
        try {
          const fn = load();
          if (typeof fn === "function") {
            await fn(partner, amount);
            return;
          }
        } catch (_) {
          /* try next */
        }
      }
    })().catch((err) => {
      console.error("[partner-fcm] notify failed:", err.message);
    });
  });
}

module.exports = {
  ensureGoogleSourceWithSubSource,
  refreshPeriodStatus,
  accruePartnerFromCompletedJob,
  ELIGIBLE_JOB_TYPES,
};
