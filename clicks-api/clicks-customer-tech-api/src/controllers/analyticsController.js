const { TechnicianEarnings, Job } = require("../../../clicks-shared/models");

const getTechnicianEarnings = async (req, res) => {
  try {
    const technician_id = req.user.id;
    const earnings = await TechnicianEarnings.findOne({ technician_id });
    res.json({ earnings });
  } catch (err) {
    res.status(500).json({ error: "Fetch earnings failed", details: err.message });
  }
};

const getPerformanceMetrics = async (req, res) => {
  try {
    const technician_id = req.user.id;
    const earnings = await TechnicianEarnings.findOne({ technician_id });
    res.json({ performance: earnings ? earnings.performance : {} });
  } catch (err) {
    res.status(500).json({ error: "Fetch performance failed", details: err.message });
  }
};

const getWeeklyStats = async (req, res) => {
  try {
    const technician_id = req.user.id;
    const earnings = await TechnicianEarnings.findOne({ technician_id });
    res.json({ weekly_earnings: earnings ? earnings.weekly_earnings : [] });
  } catch (err) {
    res.status(500).json({ error: "Fetch weekly stats failed", details: err.message });
  }
};

const getJobStatistics = async (req, res) => {
  try {
    const technician_id = req.user.id;
    const jobs = await Job.find({ assignedTechnician: technician_id });
    const completed = jobs.filter(j => j.job_status === "completed").length;
    const rejected = jobs.filter(j => j.job_status === "cancelled").length;
    const ongoing = jobs.filter(j => j.job_status === "in_progress").length;
    res.json({ completed, rejected, ongoing, total: jobs.length });
  } catch (err) {
    res.status(500).json({ error: "Fetch job statistics failed", details: err.message });
  }
};

module.exports = {
  getTechnicianEarnings,
  getPerformanceMetrics,
  getWeeklyStats,
  getJobStatistics
};
