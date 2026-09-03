const Job = require("clicks-shared/models/Job");
const Technician = require("clicks-shared/models/Technician");
const SOSRequest = require("clicks-shared/models/SOSRequest");
const Customer = require("clicks-shared/models/Customer");
const Vehicle = require("clicks-shared/models/Vehicle");
const VehicleInsurance = require("clicks-shared/models/VehicleInsurance");
const {
  COMPLETED,
  revenueForDayWindow,
  totalCompletedRevenue,
} = require("clicks-shared/utils/dashboardRevenue");
const { cachedCount } = require("clicks-shared/utils/cachedCount");
const {
  computeDashboardAggregates,
  getDashboardStatsDoc,
  refreshDashboardStats,
} = require("../services/statsRefresher");
const { getTopJobSources, getTopJobSubSources } = require("../services/dashboardSourceStats");
const { startOfQatarDay, endOfQatarDay } = require("../utils/qatarDay");
const { isHiddenSourceName } = require("clicks-shared/utils/systemSources");
const { ONGOING_JOB_STATUSES } = require("clicks-shared/constants/jobStatuses");
const Lead = require("clicks-shared/models/Lead");
const ServiceRequest = require("clicks-shared/models/ServiceRequest");
const ONGOING = ONGOING_JOB_STATUSES;

const OPEN_LEAD_STATUSES =
  Lead.OPEN_LEAD_STATUSES || ["new", "contacted", "qualified"];

function pctChange(current, previous) {
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  if (prev === 0) return cur > 0 ? 100 : 0;
  return Number((((cur - prev) / prev) * 100).toFixed(1));
}

// The business runs on Qatar time (UTC+3, no DST) while the container runs UTC,
// so "today" must be a Qatar-local day — see utils/qatarDay.js.
function startOfDay(d = new Date()) {
  return startOfQatarDay(d);
}

function endOfDay(d = new Date()) {
  return endOfQatarDay(d);
}

function completionDateExpr() {
  return { $ifNull: ["$completed_at", "$updatedAt"] };
}

function timeframeWindow(timeframe) {
  const startDate = new Date();
  let dateFormat = "%Y-%m-%d";

  switch (timeframe) {
    case "24hours":
      startDate.setHours(startDate.getHours() - 24);
      dateFormat = "%Y-%m-%d %H:00";
      break;
    case "7days":
      startDate.setDate(startDate.getDate() - 7);
      break;
    case "30days":
      startDate.setDate(startDate.getDate() - 30);
      break;
    case "12months":
    default:
      startDate.setMonth(startDate.getMonth() - 12);
      dateFormat = "%Y-%m";
      break;
  }

  return { startDate, dateFormat };
}

// GET /api/dashboard/nav-badges — single payload for sidebar badge counts
async function getNavBadges(req, res) {
  try {
    const [sosPending, sosInCall, servicePending, openLeads] = await Promise.all([
      cachedCount(SOSRequest, { status: "pending" }, { ttlMs: 15000, key: "nav_sos_pending" }),
      cachedCount(SOSRequest, { status: "in_call" }, { ttlMs: 15000, key: "nav_sos_in_call" }),
      cachedCount(ServiceRequest, { status: "pending" }, { ttlMs: 15000, key: "nav_sr_pending" }),
      cachedCount(
        Lead,
        { status: { $in: OPEN_LEAD_STATUSES } },
        { ttlMs: 30000, key: "nav_leads_open" }
      ),
    ]);

    res.json({
      sos: sosPending + sosInCall,
      serviceRequests: servicePending,
      openLeads,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch nav badges", error: err.message });
  }
}

// GET /api/dashboard/summary — ops + KPI snapshot for the admin Dashboard
async function getDashboardSummary(req, res) {
  try {
    const todayStart = startOfDay();
    const todayEnd = endOfDay();
    const yesterdayStart = startOfDay(new Date(Date.now() - 86400000));
    const yesterdayEnd = endOfDay(new Date(Date.now() - 86400000));

    const statsDoc = await getDashboardStatsDoc();
    const statsStaleMs = 5 * 60 * 1000;
    let materialized = statsDoc?.value;
    let statsComputedAt = statsDoc?.computed_at;

    if (
      !materialized?.earnings ||
      !statsComputedAt ||
      Date.now() - new Date(statsComputedAt).getTime() > statsStaleMs
    ) {
      materialized = await computeDashboardAggregates();
      statsComputedAt = new Date();
      const PlatformStats = require("clicks-shared/models/PlatformStats");
      await PlatformStats.findOneAndUpdate(
        { key: "dashboard_summary" },
        { $set: { value: materialized, computed_at: statsComputedAt } },
        { upsert: true }
      );
    }

    const [
      jobsTotal,
      jobsCompleted,
      jobsOngoing,
      jobsOnHold,
      jobsPending,
      jobsCancelled,
      jobsEnRoute,
      jobsArrived,
      jobsInProgress,
      completedToday,
      completedYesterday,
      techsActive,
      techsOnline,
      techsOnJob,
      techsOffline,
      sosPending,
      sosInCall,
      pendingJobs,
      waitingSos,
      vehiclesTotal,
      clientsTotal,
      insuredTotal,
    ] = await Promise.all([
      Job.estimatedDocumentCount(),
      cachedCount(Job, { job_status: { $in: COMPLETED } }, { ttlMs: 30000, key: "jobs_completed" }),
      cachedCount(Job, { job_status: { $in: ONGOING } }, { ttlMs: 30000, key: "jobs_ongoing" }),
      cachedCount(Job, { job_status: "on_hold" }, { ttlMs: 30000, key: "jobs_on_hold" }),
      cachedCount(Job, { job_status: "pending" }, { ttlMs: 30000, key: "jobs_pending" }),
      cachedCount(Job, { job_status: "cancelled" }, { ttlMs: 30000, key: "jobs_cancelled" }),
      cachedCount(Job, { job_status: "en_route" }, { ttlMs: 30000, key: "jobs_en_route" }),
      cachedCount(Job, { job_status: "arrived" }, { ttlMs: 30000, key: "jobs_arrived" }),
      cachedCount(Job, { job_status: "in_progress" }, { ttlMs: 30000, key: "jobs_in_progress" }),
      cachedCount(
        Job,
        { job_status: { $in: COMPLETED }, completed_at: { $gte: todayStart, $lte: todayEnd } },
        { ttlMs: 30000, key: "completed_today" }
      ),
      cachedCount(
        Job,
        {
          job_status: { $in: COMPLETED },
          completed_at: { $gte: yesterdayStart, $lte: yesterdayEnd },
        },
        { ttlMs: 30000, key: "completed_yesterday" }
      ),
      cachedCount(Technician, { isActive: true }, { ttlMs: 30000, key: "techs_active" }),
      cachedCount(
        Technician,
        { isActive: true, currentStatus: "Online" },
        { ttlMs: 30000, key: "techs_online" }
      ),
      cachedCount(
        Technician,
        { isActive: true, currentStatus: "On Job" },
        { ttlMs: 30000, key: "techs_on_job" }
      ),
      cachedCount(
        Technician,
        {
          isActive: true,
          $or: [{ currentStatus: "Offline" }, { currentStatus: { $exists: false } }],
        },
        { ttlMs: 30000, key: "techs_offline" }
      ),
      cachedCount(SOSRequest, { status: "pending" }, { ttlMs: 30000, key: "sos_pending" }),
      cachedCount(SOSRequest, { status: "in_call" }, { ttlMs: 30000, key: "sos_in_call" }),
      Job.find({ job_status: "pending" })
        .sort({ dateTime: 1 })
        .limit(5)
        .select(
          "clientName clientMobileNumber issue jobType location dateTime price business_id businessName"
        )
        .lean(),
      SOSRequest.find({ status: { $in: ["pending", "in_call"] } })
        .sort({ createdAt: 1 })
        .limit(5)
        .populate("customer_id", "first_name last_name phone_number")
        .select("status createdAt location customer_id")
        .lean(),
      Vehicle.countDocuments({}),
      Customer.countDocuments({}),
      VehicleInsurance.countDocuments({}),
    ]);

    const topSourcesRaw = Array.isArray(materialized?.topSources)
        ? materialized.topSources
        : await getTopJobSources(5);
    const topSubSourcesRaw = Array.isArray(materialized?.topSubSources)
        ? materialized.topSubSources
        : await getTopJobSubSources(5);

    const topSources = topSourcesRaw.map((row) => ({
      ...row,
      percentage:
        jobsTotal > 0 ? Math.round((row.count / jobsTotal) * 100) : 0,
    }));

    const topSubSources = topSubSourcesRaw.map((row) => ({
      ...row,
      percentage:
        jobsTotal > 0 ? Math.round((row.count / jobsTotal) * 100) : 0,
    }));

    const earningsAllTime = Number(materialized.earnings?.totalAllTime) || 0;
    const earningsToday = Number(materialized.earnings?.today) || 0;
    const earningsYesterday = Number(materialized.earnings?.yesterday) || 0;

    const sosWaitingList = waitingSos.map((s) => {
      const c = s.customer_id;
      const name = c
        ? `${c.first_name || ""} ${c.last_name || ""}`.trim()
        : "Customer";
      return {
        _id: s._id,
        status: s.status,
        createdAt: s.createdAt,
        customerName: name || "Customer",
        customerPhone: c?.phone_number || "",
      };
    });

    res.json({
      generatedAt: new Date().toISOString(),
      stats_computed_at: statsComputedAt ? new Date(statsComputedAt).toISOString() : null,
      jobs: {
        total: jobsTotal,
        completed: jobsCompleted,
        ongoing: jobsOngoing,
        onHold: jobsOnHold,
        pending: jobsPending,
        cancelled: jobsCancelled,
        enRoute: jobsEnRoute,
        arrived: jobsArrived,
        inProgress: jobsInProgress,
        completedToday,
        completedYesterday,
        pendingList: pendingJobs,
      },
      technicians: {
        active: techsActive,
        online: techsOnline,
        onJob: techsOnJob,
        offline: techsOffline,
      },
      sos: {
        pending: sosPending,
        inCall: sosInCall,
        open: sosPending + sosInCall,
        waitingList: sosWaitingList,
      },
      earnings: {
        totalAllTime: earningsAllTime,
        today: earningsToday,
        yesterday: earningsYesterday,
        currency: "QAR",
      },
      fleet: {
        vehicles: vehiclesTotal,
        clients: clientsTotal,
        insuredVehicles: insuredTotal,
      },
      trends: {
        completedJobsPct: pctChange(completedToday, completedYesterday),
        earningsPct: pctChange(earningsToday, earningsYesterday),
      },
      sources: {
        top: topSources,
        subSources: topSubSources,
      },
    });
  } catch (err) {
    res.status(500).json({
      message: "Failed to fetch dashboard summary",
      error: err.message,
    });
  }
}

// GET /api/dashboard/earnings?timeframe=12months|30days|7days|24hours
async function getEarningsData(req, res) {
  try {
    const { timeframe = "12months" } = req.query;
    const { startDate, dateFormat } = timeframeWindow(timeframe);

    // Completed jobs bucketed by completion date (not createdAt)
    const earningsData = await Job.aggregate([
      {
        $match: {
          job_status: { $in: COMPLETED },
          $expr: { $gte: [completionDateExpr(), startDate] },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: dateFormat, date: completionDateExpr() },
          },
          totalEarnings: { $sum: { $ifNull: ["$price", 0] } },
          jobCount: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const formattedData = earningsData.map((item) => ({
      date: item._id,
      earnings: item.totalEarnings,
      jobs: item.jobCount,
    }));

    const totalEarnings = formattedData.reduce((sum, item) => sum + item.earnings, 0);

    res.json({
      timeframe,
      data: formattedData,
      totalEarnings,
      currency: "QAR",
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch earnings data", error: err.message });
  }
}

// GET /api/dashboard/job-completion?timeframe=12months|30days|7days|24hours
async function getJobCompletionData(req, res) {
  try {
    const { timeframe = "12months" } = req.query;
    const { startDate, dateFormat } = timeframeWindow(timeframe);

    // Completions only — grouped by completed_at (fallback updatedAt)
    const jobData = await Job.aggregate([
      {
        $match: {
          job_status: { $in: COMPLETED },
          $expr: { $gte: [completionDateExpr(), startDate] },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: dateFormat, date: completionDateExpr() },
          },
          totalJobs: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const formattedData = jobData.map((item) => ({
      date: item._id,
      jobs: item.totalJobs,
    }));

    res.json({
      timeframe,
      data: formattedData,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch job completion data", error: err.message });
  }
}

// GET /api/dashboard/technician-performance
let techPerfCache = null;
const TECH_PERF_TTL_MS = 30000;

async function getTechnicianPerformance(req, res) {
  try {
    if (techPerfCache && techPerfCache.expiresAt > Date.now()) {
      return res.json(techPerfCache.value);
    }

    const technicians = await Technician.find({ isActive: true })
      .select("_id firstName")
      .lean();
    const techById = new Map(technicians.map((t) => [String(t._id), t.firstName]));

    const grouped = await Job.aggregate([
      { $match: { assignedTechnician: { $ne: null } } },
      {
        $group: {
          _id: { tech: "$assignedTechnician", status: "$job_status" },
          count: { $sum: 1 },
        },
      },
    ]);

    const statsByTech = new Map();
    for (const row of grouped) {
      const techId = String(row._id.tech);
      if (!techById.has(techId)) continue;
      if (!statsByTech.has(techId)) {
        statsByTech.set(techId, { completed: 0, inProgress: 0, cancelled: 0 });
      }
      const bucket = statsByTech.get(techId);
      const status = row._id.status;
      if (COMPLETED.includes(status)) bucket.completed += row.count;
      else if (ONGOING.includes(status)) bucket.inProgress += row.count;
      else if (status === "cancelled") bucket.cancelled += row.count;
    }

    const performanceData = [...statsByTech.entries()].map(([techId, counts]) => ({
      technicianId: techId,
      name: techById.get(techId),
      ...counts,
      total: counts.completed + counts.inProgress + counts.cancelled,
    }));

    performanceData.sort((a, b) => b.completed - a.completed || b.total - a.total);

    const payload = { data: performanceData.slice(0, 6) };
    techPerfCache = { value: payload, expiresAt: Date.now() + TECH_PERF_TTL_MS };
    res.json(payload);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch technician performance data", error: err.message });
  }
}

// GET /api/dashboard/earnings-by-date?date=2025-11-20
async function getEarningsByDate(req, res) {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ message: "Date parameter is required" });
    }

    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) {
      return res.status(400).json({ message: "Invalid date parameter" });
    }

    // Qatar-local day, not UTC — otherwise this reported 03:00..02:59 Qatar.
    const startDate = startOfDay(parsed);
    const endDate = endOfDay(parsed);

    const earningsAgg = await Job.aggregate([
      {
        $match: {
          job_status: { $in: COMPLETED },
          $or: [
            { completed_at: { $gte: startDate, $lte: endDate } },
            {
              $and: [
                { $or: [{ completed_at: null }, { completed_at: { $exists: false } }] },
                { updatedAt: { $gte: startDate, $lte: endDate } },
              ],
            },
          ],
        },
      },
      {
        $group: {
          _id: null,
          totalEarnings: { $sum: { $ifNull: ["$price", 0] } },
          jobCount: { $sum: 1 },
        },
      },
    ]);

    const row = earningsAgg[0] || {};
    const totalEarnings = Number(row.totalEarnings) || 0;
    const jobCount = row.jobCount || 0;

    res.json({
      date,
      totalEarnings,
      jobCount,
      currency: "QAR",
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch earnings by date", error: err.message });
  }
}

module.exports = {
  getNavBadges,
  getDashboardSummary,
  getEarningsData,
  getEarningsByDate,
  getJobCompletionData,
  getTechnicianPerformance
};
