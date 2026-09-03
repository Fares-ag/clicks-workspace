const Job = require("clicks-shared/models/Job");
const PlatformStats = require("clicks-shared/models/PlatformStats");
const {
  totalCompletedRevenue,
  revenueForDayWindow,
} = require("clicks-shared/utils/dashboardRevenue");
const { getTopJobSources, getTopJobSubSources } = require("./dashboardSourceStats");
const { startOfQatarDay, endOfQatarDay } = require("../utils/qatarDay");

const STATS_KEY = "dashboard_summary";
const FINANCE_STATS_KEY = "finance_overview_summary";

// Qatar-local day (UTC+3, no DST) — the container runs UTC, so server-local
// midnight booked overnight jobs to the wrong day. See utils/qatarDay.js.
function startOfDay(d = new Date()) {
  return startOfQatarDay(d);
}

function endOfDay(d = new Date()) {
  return endOfQatarDay(d);
}

async function computeDashboardAggregates() {
  const todayStart = startOfDay();
  const todayEnd = endOfDay();
  const yesterdayStart = startOfDay(new Date(Date.now() - 86400000));
  const yesterdayEnd = endOfDay(new Date(Date.now() - 86400000));

  const [totalAllTime, today, yesterday, topSources, topSubSources] = await Promise.all([
    totalCompletedRevenue(Job),
    revenueForDayWindow(Job, todayStart, todayEnd),
    revenueForDayWindow(Job, yesterdayStart, yesterdayEnd),
    getTopJobSources(5),
    getTopJobSubSources(5),
  ]);

  return {
    earnings: {
      totalAllTime,
      today,
      yesterday,
      currency: "QAR",
    },
    topSources,
    topSubSources,
  };
}

async function refreshDashboardStats() {
  const intervalMs = Number(process.env.STATS_REFRESH_MS || 60000);
  const staleBefore = new Date(Date.now() - intervalMs);

  // 1. Make sure the row exists. This has to be separate from the staleness
  //    filter below: an upsert whose filter also required the doc to be stale
  //    tried to insert a second { key: STATS_KEY } on every fresh tick, which
  //    the unique index on `key` rejected with E11000.
  try {
    await PlatformStats.updateOne(
      { key: STATS_KEY },
      { $setOnInsert: { key: STATS_KEY } },
      { upsert: true }
    );
  } catch (err) {
    // Two instances racing the very first insert — one of them wins, both proceed.
    if (err?.code !== 11000) throw err;
  }

  // 2. Claim the work. Stamping computed_at is what makes the doc look fresh to
  //    every other replica, so only one of them runs the aggregation.
  const claim = await PlatformStats.findOneAndUpdate(
    { key: STATS_KEY, $or: [{ computed_at: null }, { computed_at: { $lt: staleBefore } }] },
    { $set: { computed_at: new Date() } },
    { new: false }
  );

  if (!claim) return PlatformStats.findOne({ key: STATS_KEY });

  const value = await computeDashboardAggregates();
  const computed_at = new Date();

  return PlatformStats.findOneAndUpdate(
    { key: STATS_KEY },
    { $set: { value, computed_at } },
    { new: true }
  );
}

async function getDashboardStatsDoc() {
  return PlatformStats.findOne({ key: STATS_KEY }).lean();
}

async function refreshFinanceOverviewStats() {
  const { buildSummaryPayload } = require("../controllers/financeOverviewController");
  try {
    const payload = await buildSummaryPayload({ job_status: "completed" });
    await PlatformStats.findOneAndUpdate(
      { key: FINANCE_STATS_KEY },
      { $set: { value: payload, computed_at: new Date() } },
      { upsert: true }
    );
    return payload;
  } catch (err) {
    console.error("finance stats refresh failed:", err.message);
    return null;
  }
}

async function getFinanceStatsDoc() {
  return PlatformStats.findOne({ key: FINANCE_STATS_KEY }).lean();
}

function startStatsRefresher(intervalMs = Number(process.env.STATS_REFRESH_MS || 60000)) {
  const tick = () => {
    refreshDashboardStats().catch((err) => {
      console.error("statsRefresher tick failed:", err.message);
    });
    refreshFinanceOverviewStats().catch((err) => {
      console.error("finance statsRefresher tick failed:", err.message);
    });
  };
  tick();
  const handle = setInterval(tick, intervalMs);
  if (typeof handle.unref === "function") handle.unref();
  return handle;
}

function stopStatsRefresher(handle) {
  if (handle) clearInterval(handle);
}

module.exports = {
  STATS_KEY,
  FINANCE_STATS_KEY,
  computeDashboardAggregates,
  refreshDashboardStats,
  refreshFinanceOverviewStats,
  getDashboardStatsDoc,
  getFinanceStatsDoc,
  startStatsRefresher,
  stopStatsRefresher,
};
