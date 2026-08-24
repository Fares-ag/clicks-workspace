const TechnicianEarnings = require("../models/TechnicianEarnings");
const TechnicianEarningEntry = require("../models/TechnicianEarningEntry");
const Technician = require("../models/Technician");
const Receipt = require("../models/Receipt");
const {
  startOfWeekSundayUtc,
  weekEndFromStart,
} = require("./technicianOnlineHours");

/**
 * Cash the technician is physically holding for this job, i.e. what the
 * company later reclaims through settle-balance.
 * - card / wallet / fawran go straight to the company, so nothing is held.
 * - the customer pays the receipt total (base + fees + repairs), not the bare
 *   job price, so reconcile against the receipt when one exists.
 *
 * @param {import("../models/Job")} job
 * @param {number} fallbackAmount — used when no receipt is on file yet
 * @param {import("mongoose").ClientSession | null} session
 * @returns {Promise<number>}
 */
async function collectedCashForJob(job, fallbackAmount, session) {
  const method = job.payment_method || "cash";
  if (method !== "cash") return 0;

  const query = Receipt.findOne({ job_id: job._id }).sort({ issued_at: -1 });
  if (session) query.session(session);
  const receipt = await query;
  const total = Number(receipt?.total_amount);
  return Number.isFinite(total) && total > 0 ? total : fallbackAmount;
}

/**
 * Credit a completed job to the assigned technician's ledger and aggregates.
 * Idempotent via TechnicianEarningEntry unique index on job_id (11000 = already credited).
 *
 * @param {import("../models/Job")} job — must be completed with assignedTechnician
 * @param {{ session?: import("mongoose").ClientSession | null }} [options]
 * @returns {Promise<{ credited: boolean, reason?: string }>}
 */
async function creditTechnicianForJob(job, options = {}) {
  const { session = null } = options;
  const sessionOpt = session ? { session } : {};

  if (!job || job.job_status !== "completed") {
    return { credited: false, reason: "not_completed" };
  }
  if (!job.assignedTechnician) {
    return { credited: false, reason: "no_technician" };
  }

  const technicianId = job.assignedTechnician._id || job.assignedTechnician;
  const rawPrice = Number(job.price);
  const amount = Number.isFinite(rawPrice) && rawPrice > 0 ? rawPrice : 0;

  try {
    await TechnicianEarningEntry.create(
      [
        {
          technician_id: technicianId,
          job_id: job._id,
          amount,
        },
      ],
      sessionOpt
    );
  } catch (ledgerErr) {
    if (ledgerErr.code !== 11000) throw ledgerErr;
  }

  // The entry row records intent; `applied` records that the aggregates below
  // actually moved. Claiming it atomically means a concurrent run can never
  // apply the same job twice, while a retry after a partial failure (entry
  // written, aggregates not) still finishes the credit instead of
  // short-circuiting on "already_credited" and losing the money silently.
  // Matched on `applied: false` (not `$ne: true`) so pre-existing entries
  // written before this field existed keep the old already-credited behaviour.
  const claimQuery = TechnicianEarningEntry.findOneAndUpdate(
    { job_id: job._id, applied: false },
    { $set: { applied: true, applied_at: new Date() } },
    { new: true, ...sessionOpt }
  );
  const claimed = await claimQuery;

  if (!claimed) {
    return { credited: false, reason: "already_credited" };
  }

  const ledgerAmount = Number(claimed.amount) || 0;

  try {
    const cashCollected = await collectedCashForJob(job, ledgerAmount, session);
    await TechnicianEarnings.findOneAndUpdate(
      { technician_id: technicianId },
      {
        $inc: {
          total_earned: ledgerAmount,
          cash_balance: cashCollected,
          "performance.total_completed_jobs": 1,
        },
        $set: { updated_at: new Date() },
      },
      { upsert: true, new: true, ...sessionOpt }
    );
  } catch (aggErr) {
    // Inside a transaction the abort undoes the claim for us. Without one,
    // release it so the outbox retry can finish this credit.
    if (!session) {
      try {
        await TechnicianEarningEntry.updateOne(
          { _id: claimed._id },
          { $set: { applied: false }, $unset: { applied_at: 1 } }
        );
      } catch (releaseErr) {
        console.error(
          "Failed to release technician earning claim:",
          releaseErr.message
        );
      }
    }
    throw aggErr;
  }

  // Same week boundary as technicianOnlineHours so money and hours land in one
  // bucket instead of two half-filled rows per week.
  const weekStart = startOfWeekSundayUtc();
  const weekEnd = weekEndFromStart(weekStart);

  const bucketUpdate = await TechnicianEarnings.updateOne(
    {
      technician_id: technicianId,
      "weekly_earnings.week_start": weekStart,
    },
    {
      $inc: {
        "weekly_earnings.$.amount": ledgerAmount,
        "weekly_earnings.$.jobs_completed": 1,
      },
    },
    sessionOpt
  );

  if (bucketUpdate.modifiedCount === 0) {
    await TechnicianEarnings.updateOne(
      { technician_id: technicianId },
      {
        $push: {
          weekly_earnings: {
            week_start: weekStart,
            week_end: weekEnd,
            amount: ledgerAmount,
            jobs_completed: 1,
            jobs_rejected: 0,
            jobs_cancelled: 0,
            hours_online: 0,
          },
        },
      },
      { upsert: true, ...sessionOpt }
    );
  }

  const technicianQuery = Technician.findById(technicianId);
  if (session) technicianQuery.session(session);
  const technician = await technicianQuery;
  if (technician) {
    if (!technician.performance) technician.performance = {};
    technician.performance.completedJobs =
      (technician.performance.completedJobs || 0) + 1;
    await technician.save(sessionOpt);
  }

  return { credited: true };
}

module.exports = { creditTechnicianForJob };
