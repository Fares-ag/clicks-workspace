const Technician = require("../models/Technician");
const TechnicianEarnings = require("../models/TechnicianEarnings");
const Job = require("../models/Job");

// GET /api/performance - Get all technicians' performance
async function getAllPerformance(req, res) {
  try {
    const { page = 1, limit = 10, search = "" } = req.query;
    
    // Build search query
    const searchQuery = search
      ? {
          $or: [
            { firstName: { $regex: search, $options: "i" } },
            { lastName: { $regex: search, $options: "i" } }
          ]
        }
      : {};
    
    // Get all technicians with search
    const technicians = await Technician.find(searchQuery)
      .select("firstName lastName profilePicture email")
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .sort({ firstName: 1 });
    
    const total = await Technician.countDocuments(searchQuery);
    
    // Get all technician IDs for efficient queries
    const technicianIds = technicians.map(t => t._id);
    
    // Fetch all earnings data in one query
    const earningsData = await TechnicianEarnings.find({
      technician_id: { $in: technicianIds }
    });
    
    // Create a map for quick lookup
    const earningsMap = new Map();
    earningsData.forEach(earning => {
      earningsMap.set(earning.technician_id.toString(), earning);
    });
    
    // Get ongoing jobs count for all technicians in one query
    const ongoingJobsAggregation = await Job.aggregate([
      {
        $match: {
          assignedTechnician: { $in: technicianIds },
          job_status: { $in: ["assigned", "en_route", "arrived", "in_progress"] }
        }
      },
      {
        $group: {
          _id: { $toString: "$assignedTechnician" },
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Create a map for ongoing jobs
    const ongoingJobsMap = new Map();
    ongoingJobsAggregation.forEach(item => {
      ongoingJobsMap.set(item._id, item.count);
    });
    
    // Build performance data for each technician
    const performanceData = technicians.map(tech => {
      const earnings = earningsMap.get(tech._id.toString());
      const ongoingJobs = ongoingJobsMap.get(tech._id.toString()) || 0;
      
      // Calculate total online hours from weekly_earnings
      const totalOnlineHours = earnings?.weekly_earnings?.reduce((sum, week) => {
        return sum + (week.hours_online || 0);
      }, 0) || 0;
      
      // Calculate cancellation rate
      const completedJobs = earnings?.performance?.total_completed_jobs || 0;
      const cancelledJobs = earnings?.performance?.total_cancelled_jobs || 0;
      const totalJobs = completedJobs + cancelledJobs;
      const cancellationRate = totalJobs > 0
        ? (cancelledJobs / totalJobs) * 100
        : 0;
      
      return {
        _id: tech._id,
        firstName: tech.firstName,
        lastName: tech.lastName,
        profileImage: tech.profilePicture,
        email: tech.email,
        totalEarnings: earnings?.total_earned || 0,
        completedJobs: completedJobs,
        totalOnlineHours: Math.round(totalOnlineHours),
        ongoingJobs: ongoingJobs,
        cashBalance: earnings?.cash_balance || 0,
        // No job cost field yet — treat profit as gross earnings
        totalProfit: earnings?.total_earned || 0,
        cancellationRate: parseFloat(cancellationRate.toFixed(2))
      };
    });
    
    res.json({ performance: performanceData, total });
  } catch (err) {
    console.error("Error fetching performance:", err);
    res.status(500).json({ message: "Failed to fetch performance data", error: err.message });
  }
}

// GET /api/performance/export-csv - Export performance data as CSV
async function exportPerformanceCSV(req, res) {
  try {
    // Get all technicians (no pagination for export)
    const technicians = await Technician.find()
      .select("firstName lastName profilePicture email")
      .sort({ firstName: 1 });
    
    // Get all technician IDs for efficient queries
    const technicianIds = technicians.map(t => t._id);
    
    // Fetch all earnings data in one query
    const earningsData = await TechnicianEarnings.find({
      technician_id: { $in: technicianIds }
    });
    
    // Create a map for quick lookup
    const earningsMap = new Map();
    earningsData.forEach(earning => {
      earningsMap.set(earning.technician_id.toString(), earning);
    });
    
    // Get ongoing jobs count for all technicians in one query
    const ongoingJobsAggregation = await Job.aggregate([
      {
        $match: {
          assignedTechnician: { $in: technicianIds },
          job_status: { $in: ["assigned", "en_route", "arrived", "in_progress"] }
        }
      },
      {
        $group: {
          _id: { $toString: "$assignedTechnician" },
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Create a map for ongoing jobs
    const ongoingJobsMap = new Map();
    ongoingJobsAggregation.forEach(item => {
      ongoingJobsMap.set(item._id, item.count);
    });
    
    // Build performance data for each technician
    const performanceData = technicians.map(tech => {
      const earnings = earningsMap.get(tech._id.toString());
      const ongoingJobs = ongoingJobsMap.get(tech._id.toString()) || 0;
      
      const totalOnlineHours = earnings?.weekly_earnings?.reduce((sum, week) => {
        return sum + (week.hours_online || 0);
      }, 0) || 0;
      
      const completedJobs = earnings?.performance?.total_completed_jobs || 0;
      const cancelledJobs = earnings?.performance?.total_cancelled_jobs || 0;
      const totalJobs = completedJobs + cancelledJobs;
      const cancellationRate = totalJobs > 0
        ? (cancelledJobs / totalJobs) * 100
        : 0;
      
      return {
        name: `${tech.firstName} ${tech.lastName}`,
        totalEarnings: earnings?.total_earned || 0,
        completedJobs: completedJobs,
        totalOnlineHours: Math.round(totalOnlineHours),
        ongoingJobs: ongoingJobs,
        cashBalance: earnings?.cash_balance || 0,
        totalProfit: earnings?.total_earned || 0,
        cancellationRate: parseFloat(cancellationRate.toFixed(2))
      };
    });
    
    // Create CSV content
    const headers = [
      'Name',
      'Total Earnings',
      'Completed Jobs',
      'Total Online Hours',
      'Ongoing Jobs',
      'Cash Balance',
      'Total Profit',
      'Cancellation Rate'
    ];
    
    const csvRows = performanceData.map(row => [
      `"${row.name}"`,
      row.totalEarnings,
      row.completedJobs,
      row.totalOnlineHours,
      row.ongoingJobs,
      row.cashBalance,
      row.totalProfit,
      `${row.cancellationRate}%`
    ].join(','));
    
    const csvContent = [headers.join(','), ...csvRows].join('\n');
    
    // Set response headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=performance-report-${Date.now()}.csv`);
    res.send(csvContent);
  } catch (err) {
    console.error("Error exporting CSV:", err);
    res.status(500).json({ message: "Failed to export CSV", error: err.message });
  }
}

module.exports = {
  getAllPerformance,
  exportPerformanceCSV
};
