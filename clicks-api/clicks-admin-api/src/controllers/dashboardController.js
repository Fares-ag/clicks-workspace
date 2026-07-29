const Job = require("clicks-shared/models/Job");
const Technician = require("clicks-shared/models/Technician");
const SOSRequest = require("clicks-shared/models/SOSRequest");
const Customer = require("clicks-shared/models/Customer");
const Vehicle = require("clicks-shared/models/Vehicle");
const VehicleInsurance = require("clicks-shared/models/VehicleInsurance");

const COMPLETED = ["completed"];
const ONGOING = ["assigned", "accepted", "en_route", "arrived", "in_progress"];

function pctChange(current, previous) {
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  if (prev === 0) return cur > 0 ? 100 : 0;
  return Number((((cur - prev) / prev) * 100).toFixed(1));
}

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
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

// GET /api/dashboard/summary — ops + KPI snapshot for the admin Dashboard
async function getDashboardSummary(req, res) {
  try {
    const todayStart = startOfDay();
    const todayEnd = endOfDay();
    const yesterdayStart = startOfDay(new Date(Date.now() - 86400000));
    const yesterdayEnd = endOfDay(new Date(Date.now() - 86400000));

    const [
      jobsTotal,
      jobsCompleted,
      jobsOngoing,
      jobsPending,
      jobsCancelled,
      jobsEnRoute,
      jobsArrived,
      jobsInProgress,
      completedToday,
      completedYesterday,
      earningsAllTimeAgg,
      earningsTodayAgg,
      earningsYesterdayAgg,
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
      Job.countDocuments({}),
      Job.countDocuments({ job_status: { $in: COMPLETED } }),
      Job.countDocuments({ job_status: { $in: ONGOING } }),
      Job.countDocuments({ job_status: "pending" }),
      Job.countDocuments({ job_status: "cancelled" }),
      Job.countDocuments({ job_status: "en_route" }),
      Job.countDocuments({ job_status: "arrived" }),
      Job.countDocuments({ job_status: "in_progress" }),
      Job.countDocuments({
        job_status: { $in: COMPLETED },
        completed_at: { $gte: todayStart, $lte: todayEnd },
      }),
      Job.countDocuments({
        job_status: { $in: COMPLETED },
        completed_at: { $gte: yesterdayStart, $lte: yesterdayEnd },
      }),
      Job.aggregate([
        { $match: { job_status: { $in: COMPLETED } } },
        { $group: { _id: null, total: { $sum: "$price" } } },
      ]),
      Job.aggregate([
        {
          $match: {
            job_status: { $in: COMPLETED },
            $or: [
              { paid_at: { $gte: todayStart, $lte: todayEnd } },
              {
                paid_at: { $exists: false },
                completed_at: { $gte: todayStart, $lte: todayEnd },
              },
            ],
          },
        },
        { $group: { _id: null, total: { $sum: "$price" } } },
      ]),
      Job.aggregate([
        {
          $match: {
            job_status: { $in: COMPLETED },
            $or: [
              { paid_at: { $gte: yesterdayStart, $lte: yesterdayEnd } },
              {
                paid_at: { $exists: false },
                completed_at: { $gte: yesterdayStart, $lte: yesterdayEnd },
              },
            ],
          },
        },
        { $group: { _id: null, total: { $sum: "$price" } } },
      ]),
      Technician.countDocuments({ isActive: true }),
      Technician.countDocuments({ isActive: true, currentStatus: "Online" }),
      Technician.countDocuments({ isActive: true, currentStatus: "On Job" }),
      Technician.countDocuments({
        isActive: true,
        $or: [{ currentStatus: "Offline" }, { currentStatus: { $exists: false } }],
      }),
      SOSRequest.countDocuments({ status: "pending" }),
      SOSRequest.countDocuments({ status: "in_call" }),
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

    const earningsAllTime = Number(earningsAllTimeAgg[0]?.total) || 0;
    const earningsToday = Number(earningsTodayAgg[0]?.total) || 0;
    const earningsYesterday = Number(earningsYesterdayAgg[0]?.total) || 0;

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
      jobs: {
        total: jobsTotal,
        completed: jobsCompleted,
        ongoing: jobsOngoing,
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
async function getTechnicianPerformance(req, res) {
  try {
    const technicians = await Technician.find({ isActive: true }).select("firstName");

    const performanceData = await Promise.all(
      technicians.map(async (tech) => {
        const [completed, inProgress, cancelled] = await Promise.all([
          Job.countDocuments({
            assignedTechnician: tech._id,
            job_status: { $in: COMPLETED },
          }),
          Job.countDocuments({
            assignedTechnician: tech._id,
            job_status: { $in: ONGOING },
          }),
          Job.countDocuments({
            assignedTechnician: tech._id,
            job_status: "cancelled",
          }),
        ]);

        return {
          technicianId: tech._id,
          name: tech.firstName,
          completed,
          inProgress,
          cancelled,
          total: completed + inProgress + cancelled,
        };
      })
    );

    // Top 6 by completed jobs
    performanceData.sort((a, b) => b.completed - a.completed || b.total - a.total);

    res.json({
      data: performanceData.slice(0, 6),
    });
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

    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    const jobs = await Job.find({
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
    });

    const totalEarnings = jobs.reduce((sum, job) => sum + (parseFloat(job.price) || 0), 0);

    res.json({
      date,
      totalEarnings,
      jobCount: jobs.length,
      currency: "QAR",
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch earnings by date", error: err.message });
  }
}

module.exports = {
  getDashboardSummary,
  getEarningsData,
  getEarningsByDate,
  getJobCompletionData,
  getTechnicianPerformance
};
