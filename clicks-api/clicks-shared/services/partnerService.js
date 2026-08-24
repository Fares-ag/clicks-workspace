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

  // A row already on file means eligibility was settled on an earlier pass —
  // hand it to applyPartnerEarning, which finishes the credit if the previous
  // attempt died between writing the row and moving accruedTotal.
  const existing = await PartnerEarning.findOne({ job: job._id });
  if (existing) return applyPartnerEarning(existing, job);

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
  if (!Number.isFinite(price) || price <= 0) return null;

  const credit = Math.min(price, remaining);

  // Ledger first: PartnerEarning.job is uniquely indexed, so the row (or a
  // duplicate-key error on it) is the idempotency signal. Moving accruedTotal
  // first would let a failed create send the outbox retry through the
  // "no earning row yet" guard above and credit the same job twice.
  let earning;
  try {
    earning = await PartnerEarning.create({
      partner: partner._id,
      job: job._id,
      amount: credit,
      period: partner.currentPeriod,
    });
  } catch (earningErr) {
    if (earningErr.code !== 11000) throw earningErr;
    earning = await PartnerEarning.findOne({ job: job._id });
    if (!earning) throw earningErr;
  }

  return applyPartnerEarning(earning, job);
}

/**
 * Move a ledger row's amount into Partner.accruedTotal exactly once.
 *
 * The row records intent; `applied` records that the aggregate actually moved.
 * Claiming it atomically means a concurrent run can never credit the same job
 * twice, while a retry after a partial failure (row written, $inc not) still
 * finishes the credit instead of short-circuiting on "already credited" and
 * losing the money silently — accruedTotal is what withdrawals are paid from.
 * Matched on `applied: false` (not `$ne: true`) so rows written before this
 * field existed are never re-applied on deploy.
 */
async function applyPartnerEarning(earning, job) {
  const claimed = await PartnerEarning.findOneAndUpdate(
    { job: earning.job, applied: false },
    { $set: { applied: true, applied_at: new Date() } },
    { new: true }
  );
  if (!claimed) return earning;

  const credit = Number(claimed.amount) || 0;

  // Atomic $inc — a read-modify-write on a money field loses concurrent accruals.
  let updated;
  try {
    updated = await Partner.findOneAndUpdate(
      { _id: claimed.partner },
      { $inc: { accruedTotal: credit } },
      { new: true }
    );
    if (!updated) throw new Error(`Partner ${claimed.partner} not found for accrual`);
  } catch (incErr) {
    // Release the claim so the outbox retry can finish this credit.
    try {
      await PartnerEarning.updateOne(
        { _id: claimed._id },
        { $set: { applied: false }, $unset: { applied_at: 1 } }
      );
    } catch (releaseErr) {
      console.error(
        "Failed to release partner earning claim:",
        releaseErr.message
      );
    }
    throw incErr;
  }

  if (Number(updated.accruedTotal || 0) >= updated.periodCap()) {
    await Partner.updateOne({ _id: updated._id }, { $set: { status: "capped" } });
    updated.status = "capped";
  }

  if (!job.partner_id || String(job.partner_id) !== String(claimed.partner)) {
    job.partner_id = claimed.partner;
    await job.save();
  }

  notifyPartnerAccrualAsync(updated, credit);

  return claimed;
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
