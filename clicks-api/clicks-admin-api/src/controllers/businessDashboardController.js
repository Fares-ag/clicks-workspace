const Job = require("../models/Job");
const Technician = require("../models/Technician");

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

function cutAmountExpr() {
  return {
    $multiply: [
      { $ifNull: ["$price", 0] },
      { $divide: [{ $ifNull: ["$businessCutPercent", 0] }, 100] },
    ],
  };
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

function businessMatch(businessId) {
  return { business_id: businessId };
}

async function getSummary(req, res) {
  try {
    const businessId = req.business._id;
    const base = businessMatch(businessId);
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
      completedToday,
      completedYesterday,
      earningsAllTimeAgg,
      earningsTodayAgg,
      earningsYesterdayAgg,
      pendingJobs,
      uniqueClientsAgg,
      uniqueVehiclesAgg,
      assignedTechIdsAgg,
    ] = await Promise.all([
      Job.countDocuments(base),
      Job.countDocuments({ ...base, job_status: { $in: COMPLETED } }),
      Job.countDocuments({ ...base, job_status: { $in: ONGOING } }),
      Job.countDocuments({ ...base, job_status: "pending" }),
      Job.countDocuments({ ...base, job_status: "cancelled" }),
      Job.countDocuments({ ...base, job_status: "en_route" }),
      Job.countDocuments({
        ...base,
        job_status: { $in: COMPLETED },
        completed_at: { $gte: todayStart, $lte: todayEnd },
      }),
      Job.countDocuments({
        ...base,
        job_status: { $in: COMPLETED },
        completed_at: { $gte: yesterdayStart, $lte: yesterdayEnd },
      }),
      Job.aggregate([
        { $match: { ...base, job_status: { $in: COMPLETED } } },
        { $group: { _id: null, total: { $sum: cutAmountExpr() } } },
      ]),
      Job.aggregate([
        {
          $match: {
            ...base,
            job_status: { $in: COMPLETED },
            completed_at: { $gte: todayStart, $lte: todayEnd },
          },
        },
        { $group: { _id: null, total: { $sum: cutAmountExpr() } } },
      ]),
      Job.aggregate([
        {
          $match: {
            ...base,
            job_status: { $in: COMPLETED },
            completed_at: { $gte: yesterdayStart, $lte: yesterdayEnd },
          },
        },
        { $group: { _id: null, total: { $sum: cutAmountExpr() } } },
      ]),
      Job.find({ ...base, job_status: "pending" })
        .sort({ dateTime: 1 })
        .limit(5)
        .select(
          "clientName clientMobileNumber issue jobType location dateTime price business_id businessName"
        )
        .lean(),
      Job.aggregate([
        { $match: base },
        { $group: { _id: "$clientMobileNumber" } },
        { $match: { _id: { $nin: [null, ""] } } },
        { $count: "total" },
      ]),
      Job.aggregate([
        { $match: base },
        {
          $group: {
            _id: {
              make: "$vehicleMake",
              model: "$vehicleModel",
              year: "$vehicleYear",
            },
          },
        },
        {
          $match: {
            "_id.make": { $nin: [null, ""] },
            "_id.model": { $nin: [null, ""] },
          },
        },
        { $count: "total" },
      ]),
      Job.distinct("assignedTechnician", {
        ...base,
        assignedTechnician: { $exists: true, $ne: null },
      }),
    ]);

    const techIds = assignedTechIdsAgg.filter(Boolean);
    let techsOnline = 0;
    let techsOnJob = 0;
    let techsActive = techIds.length;

    if (techIds.length > 0) {
      [techsOnline, techsOnJob] = await Promise.all([
        Technician.countDocuments({
          _id: { $in: techIds },
          isActive: true,
          currentStatus: "Online",
        }),
        Technician.countDocuments({
          _id: { $in: techIds },
          isActive: true,
          currentStatus: "On Job",
        }),
      ]);
    }

    const earningsAllTime = Math.round((earningsAllTimeAgg[0]?.total || 0) * 100) / 100;
    const earningsToday = Math.round((earningsTodayAgg[0]?.total || 0) * 100) / 100;
    const earningsYesterday =
      Math.round((earningsYesterdayAgg[0]?.total || 0) * 100) / 100;

    res.json({
      generatedAt: new Date().toISOString(),
      jobs: {
        total: jobsTotal,
        completed: jobsCompleted,
        ongoing: jobsOngoing,
        pending: jobsPending,
        cancelled: jobsCancelled,
        enRoute: jobsEnRoute,
        completedToday,
        completedYesterday,
        pendingList: pendingJobs,
      },
      technicians: {
        active: techsActive,
        online: techsOnline,
        onJob: techsOnJob,
        offline: Math.max(0, techsActive - techsOnline - techsOnJob),
      },
      sos: {
        pending: 0,
        inCall: 0,
        open: 0,
        waitingList: [],
      },
      earnings: {
        totalAllTime: earningsAllTime,
        today: earningsToday,
        yesterday: earningsYesterday,
        currency: "QAR",
      },
      fleet: {
        vehicles: uniqueVehiclesAgg[0]?.total || 0,
        clients: uniqueClientsAgg[0]?.total || 0,
        insuredVehicles: 0,
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

async function getEarningsData(req, res) {
  try {
    const businessId = req.business._id;
    const { timeframe = "12months" } = req.query;
    const { startDate, dateFormat } = timeframeWindow(timeframe);

    const earningsData = await Job.aggregate([
      {
        $match: {
          business_id: businessId,
          job_status: { $in: COMPLETED },
          $expr: { $gte: [completionDateExpr(), startDate] },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: dateFormat, date: completionDateExpr() },
          },
          totalEarnings: { $sum: cutAmountExpr() },
          jobCount: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const formattedData = earningsData.map((item) => ({
      date: item._id,
      earnings: Math.round((item.totalEarnings || 0) * 100) / 100,
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

async function getJobCompletionData(req, res) {
  try {
    const businessId = req.business._id;
    const { timeframe = "12months" } = req.query;
    const { startDate, dateFormat } = timeframeWindow(timeframe);

    const jobData = await Job.aggregate([
      {
        $match: {
          business_id: businessId,
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

    res.json({
      timeframe,
      data: jobData.map((item) => ({
        date: item._id,
        jobs: item.totalJobs,
      })),
    });
  } catch (err) {
    res.status(500).json({
      message: "Failed to fetch job completion data",
      error: err.message,
    });
  }
}

async function getTechnicianPerformance(req, res) {
  try {
    const businessId = req.business._id;
    const techIds = await Job.distinct("assignedTechnician", {
      business_id: businessId,
      assignedTechnician: { $exists: true, $ne: null },
    });

    if (!techIds.length) {
      return res.json({ data: [] });
    }

    const technicians = await Technician.find({ _id: { $in: techIds } }).select(
      "firstName"
    );

    const performanceData = await Promise.all(
      technicians.map(async (tech) => {
        const base = { business_id: businessId, assignedTechnician: tech._id };
        const [completed, inProgress, cancelled] = await Promise.all([
          Job.countDocuments({ ...base, job_status: { $in: COMPLETED } }),
          Job.countDocuments({ ...base, job_status: { $in: ONGOING } }),
          Job.countDocuments({ ...base, job_status: "cancelled" }),
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

    performanceData.sort((a, b) => b.completed - a.completed || b.total - a.total);

    res.json({ data: performanceData.slice(0, 6) });
  } catch (err) {
    res.status(500).json({
      message: "Failed to fetch technician performance data",
      error: err.message,
    });
  }
}

async function getEarningsByDate(req, res) {
  try {
    const businessId = req.business._id;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ message: "Date parameter is required" });
    }

    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    const jobs = await Job.find({
      business_id: businessId,
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
    }).lean();

    const totalEarnings = jobs.reduce((sum, job) => {
      const price = Number(job.price) || 0;
      const pct = Number(job.businessCutPercent) || 0;
      return sum + (price * pct) / 100;
    }, 0);

    res.json({
      date,
      totalEarnings: Math.round(totalEarnings * 100) / 100,
      jobCount: jobs.length,
      currency: "QAR",
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch earnings by date", error: err.message });
  }
}

module.exports = {
  getSummary,
  getEarningsData,
  getJobCompletionData,
  getTechnicianPerformance,
  getEarningsByDate,
};
