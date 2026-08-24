/**
 * Admin-side, READ-ONLY window onto the finance portal's numbers: what has been
 * audited and what is still waiting. Nothing here writes — auditing, re-auditing
 * and vendor management stay in the finance portal (routes/financePortal.js).
 */
const Job = require("../models/Job");
const { escapeRegex } = require("../../../clicks-shared/utils/escapeRegex");
const { str } = require("../../../clicks-shared/utils/coerce");

const COMPLETED_MATCH = { job_status: "completed" };

/** Qatar is UTC+3 with no DST, so a calendar day maps to an exact absolute window. */
const QATAR_OFFSET = "+03:00";
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// Mirrors clicks-shared/utils/jobPricing.js — the pending totals below are the
// aggregation-pipeline twin of computeFinancePreview(), so the two must agree.
const nightFeeExpr = { $literal: 0 };

const PENDING_AGG_MAX_MS = 15000;
const SUMMARY_TTL_MS = 30000;
/** Shorter TTL for a summary whose pending totals failed: the failure must be
 *  cached too (a 15s join that times out would otherwise be restarted by every
 *  single poll), but it should be retried far sooner than a good read. */
const SUMMARY_FAIL_TTL_MS = 10000;

/**
 * Absolute instant for the start/end of a Qatar-local YYYY-MM-DD day.
 * The offset is written out explicitly: building the date from server-local
 * midnight would land on the previous day in a UTC container.
 */
function qatarDayBoundary(value, endOfDay) {
  // Coerce generously and let DAY_RE do the rejecting: truncating to 10 chars
  // first would quietly turn "2026-08-24999" into a valid day, where the finance
  // portal's qatarDayStart answers 400.
  const day = str(value, { maxLength: 32 }).trim();
  if (!DAY_RE.test(day)) return null;
  const time = endOfDay ? "23:59:59.999" : "00:00:00.000";
  const d = new Date(`${day}T${time}${QATAR_OFFSET}`);
  return Number.isFinite(d.getTime()) ? d : null;
}

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Pipeline twin of JavaScript's `field || fallback` for a numeric path: a
 * missing, null, non-numeric OR zero value becomes the fallback, which is what
 * `(r.price || 0)` and `(r.quantity || 1)` do in computeJobPricing().
 */
function numOr(path, fallback) {
  return {
    $let: {
      vars: {
        v: { $convert: { input: path, to: "double", onError: fallback, onNull: fallback } },
      },
      in: { $cond: [{ $eq: ["$$v", 0] }, fallback, "$$v"] },
    },
  };
}

const distanceFeeExpr = {
  $let: {
    vars: {
      km: { $convert: { input: "$distance_km", to: "double", onError: 0, onNull: 0 } },
    },
    in: { $cond: [{ $gt: ["$$km", 0] }, { $multiply: ["$$km", 2] }, 0] },
  },
};

/**
 * Revenue/cost totals for jobs that have no finance snapshot yet, recomputed the
 * same way computeFinancePreview() would: base price + distance + night fee +
 * repair lines for revenue, repair costs + finance extra costs for cost.
 */
function pendingTotalsPipeline(match) {
  return [
    { $match: match },
    { $project: { price: 1, distance_km: 1, dateTime: 1, finance_extra_costs: 1 } },
    {
      $lookup: {
        from: "repairprocedures",
        let: { jobId: "$_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$job_id", "$$jobId"] } } },
          {
            $group: {
              _id: null,
              price: { $sum: { $multiply: [numOr("$price", 0), numOr("$quantity", 1)] } },
              cost: { $sum: { $multiply: [numOr("$cost", 0), numOr("$quantity", 1)] } },
            },
          },
        ],
        as: "repairTotals",
      },
    },
    {
      $addFields: {
        _basePrice: numOr("$price", 0),
        _distanceFee: distanceFeeExpr,
        _timeFee: nightFeeExpr,
        _repairsTotal: { $ifNull: [{ $arrayElemAt: ["$repairTotals.price", 0] }, 0] },
        _repairsCost: { $ifNull: [{ $arrayElemAt: ["$repairTotals.cost", 0] }, 0] },
        _extraTotal: {
          $sum: {
            $map: {
              input: { $ifNull: ["$finance_extra_costs", []] },
              as: "row",
              in: numOr("$$row.amount", 0),
            },
          },
        },
      },
    },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        revenue: {
          $sum: { $add: ["$_basePrice", "$_distanceFee", "$_timeFee", "$_repairsTotal"] },
        },
        costTotal: { $sum: { $add: ["$_repairsCost", "$_extraTotal"] } },
      },
    },
  ];
}

/**
 * The pending totals join every unaudited job to its repair rows, which is far
 * too heavy to re-run on every poll of an admin dashboard. Overview figures
 * tolerate a few seconds of drift — the same trade-off cachedCount makes for the
 * badge counts. Failed reads are cached as well, for a shorter window, so a join
 * that is timing out cannot be re-triggered by every request that arrives.
 */
let summaryCache = null;

function readSummaryCache() {
  if (summaryCache && summaryCache.expiresAt > Date.now()) return summaryCache.value;
  return null;
}

function writeSummaryCache(value, ttlMs) {
  const ttl = Number.isFinite(ttlMs) ? ttlMs : SUMMARY_TTL_MS;
  summaryCache = { value, expiresAt: Date.now() + ttl };
}

/** One shared computation while the cache is cold, so a burst of admin polls
 *  cannot each launch its own copy of the pending join. */
let summaryInFlight = null;

function clearSummaryCache() {
  summaryCache = null;
  summaryInFlight = null;
}

/**
 * Shared completed-job filter (search + Qatar date window). Status is applied
 * separately by buildJobQuery and by the summary buckets.
 */
function buildSharedFilters(rawQuery) {
  const src = rawQuery || {};
  const query = { ...COMPLETED_MATCH };
  const andClauses = [];

  const search = str(src.search, { maxLength: 64 }).trim();
  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    andClauses.push({
      $or: [
        { job_reference: rx },
        { clientName: rx },
        { clientMobileNumber: rx },
        { issue: rx },
        { location: rx },
        { businessName: rx },
      ],
    });
  }

  const range = {};
  const fromRaw = str(src.from).trim();
  if (fromRaw) {
    const from = qatarDayBoundary(fromRaw, false);
    if (!from) return { error: "Invalid from date" };
    range.$gte = from;
  }
  const toRaw = str(src.to).trim();
  if (toRaw) {
    const to = qatarDayBoundary(toRaw, true);
    if (!to) return { error: "Invalid to date" };
    range.$lte = to;
  }
  if (range.$gte || range.$lte) {
    andClauses.push({
      $or: [{ completed_at: range }, { completed_at: null, createdAt: range }],
    });
  }

  if (andClauses.length === 1) {
    Object.assign(query, andClauses[0]);
  } else if (andClauses.length > 1) {
    query.$and = andClauses;
  }

  return { query };
}

function hasSummaryFilters(rawQuery) {
  const src = rawQuery || {};
  return Boolean(
    str(src.search, { maxLength: 64 }).trim() ||
      str(src.from).trim() ||
      str(src.to).trim()
  );
}

/**
 * Job filter for the list endpoint, kept deliberately identical to the finance
 * portal's own buildJobsFilter so both screens count the same jobs. Every
 * user-supplied value goes through str() first, so a repeated ?search= (an
 * array) can never reach $regex as an operator. Returns { query } or { error }.
 */
function buildJobQuery(rawQuery) {
  const shared = buildSharedFilters(rawQuery);
  if (shared.error) return shared;

  const query = { ...shared.query };
  const status = str(rawQuery?.status).trim();
  if (status === "audited") {
    query.finance_status = "audited";
  } else if (status === "pending") {
    query.finance_status = { $ne: "audited" };
  }

  return { query };
}

function parsePaging(query = {}) {
  const page = Math.max(1, parseInt(str(query.page), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(str(query.limit), 10) || 20));
  return { page, limit };
}

/**
 * The summary itself, split out of the handler so several requests arriving
 * while the cache is cold can await one computation instead of each starting
 * its own pending join.
 */
async function buildSummaryPayload(baseQuery = COMPLETED_MATCH) {
  const auditedMatch = { ...baseQuery, finance_status: "audited" };
  const pendingMatch = { ...baseQuery, finance_status: { $ne: "audited" } };

  const [auditedRows, totalCompleted] = await Promise.all([
    Job.aggregate([
      { $match: auditedMatch },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          revenue: { $sum: { $ifNull: ["$finance_revenue", 0] } },
          costTotal: { $sum: { $ifNull: ["$finance_cost_total", 0] } },
          netProfit: { $sum: { $ifNull: ["$finance_net_profit", 0] } },
        },
      },
    ]),
    Job.countDocuments(baseQuery),
  ]);

  const auditedRow = auditedRows[0] || {};
  const audited = {
    count: auditedRow.count || 0,
    revenue: round2(auditedRow.revenue),
    costTotal: round2(auditedRow.costTotal),
    netProfit: round2(auditedRow.netProfit),
  };

  // A pending job has no snapshot, so its money is recomputed live. If that
  // join is too slow to finish, report zeros with pendingComputed:false rather
  // than guessing a number the finance portal would disagree with.
  let pending;
  let pendingComputed = true;
  try {
    const pendingRows = await Job.aggregate(pendingTotalsPipeline(pendingMatch)).option({
      maxTimeMS: PENDING_AGG_MAX_MS,
    });
    const pendingRow = pendingRows[0] || {};
    const revenue = round2(pendingRow.revenue);
    const costTotal = round2(pendingRow.costTotal);
    pending = {
      count: pendingRow.count || 0,
      revenue,
      costTotal,
      netProfit: round2(revenue - costTotal),
    };
  } catch (err) {
    console.error("Finance overview pending totals failed:", err.message);
    pendingComputed = false;
    pending = {
      count: await Job.countDocuments(pendingMatch),
      revenue: 0,
      costTotal: 0,
      netProfit: 0,
    };
  }

  const payload = { audited, pending, totalCompleted, pendingComputed };
  return payload;
}

async function buildCachedSummaryPayload() {
  const payload = await buildSummaryPayload(COMPLETED_MATCH);
  writeSummaryCache(payload, payload.pendingComputed ? SUMMARY_TTL_MS : SUMMARY_FAIL_TTL_MS);
  return payload;
}

async function getSummary(req, res) {
  try {
    const shared = buildSharedFilters(req.query);
    if (shared.error) return res.status(400).json({ message: shared.error });

    if (!hasSummaryFilters(req.query)) {
      const cached = readSummaryCache();
      if (cached) return res.json(cached);

      if (!summaryInFlight) {
        const run = buildCachedSummaryPayload();
        run.catch(() => {});
        const release = () => {
          if (summaryInFlight === run) summaryInFlight = null;
        };
        run.then(release, release);
        summaryInFlight = run;
      }

      const payload = await summaryInFlight;
      return res.json(payload);
    }

    const payload = await buildSummaryPayload(shared.query);
    res.json(payload);
  } catch (err) {
    res.status(500).json({ message: "Failed to load finance overview", error: err.message });
  }
}

async function listJobs(req, res) {
  try {
    const built = buildJobQuery(req.query);
    if (built.error) return res.status(400).json({ message: built.error });

    const { page, limit } = parsePaging(req.query);

    const [jobs, total] = await Promise.all([
      Job.find(built.query)
        .populate("assignedTechnician", "firstName lastName")
        .populate("source", "mainSourceName")
        .sort({ completed_at: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Job.countDocuments(built.query),
    ]);

    res.json({ jobs, total, page, limit });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch finance jobs", error: err.message });
  }
}

module.exports = {
  getSummary,
  listJobs,
  clearSummaryCache,
};
