import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, Sector,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { useGetJobsQuery } from "../../store/jobApi";
import { getJobStatusLabel } from "../../utils/jobStatusLabels";
import { useGetTechniciansQuery } from "../../store/technicianApi";
import { useGetVehiclesQuery } from "../../store/vehicleApi";
import { useGetCustomersQuery } from "../../store/customerApi";
import { useGetVehicleInsurancesQuery } from "../../store/vehicleInsuranceApi";
import { 
  useGetDashboardSummaryQuery,
  useGetEarningsDataQuery, 
  useGetJobCompletionDataQuery,
  useGetAllTechniciansPerformanceQuery,
  useGetEarningsByDateQuery
} from "../../store/dashboardApi";
import { useGetSOSRequestsQuery } from "../../store/sosApi";
import { useGetSourcesQuery } from "../../store/sourceApi";
import { getJobSourceSubLabel, getSourceName } from "../../utils/jobOrigin";
import { isHiddenSourceName } from "../../utils/systemSources";
import DatePicker from "../../components/DatePicker";
import { useAdminRole } from "../../utils/adminRoles";
import "./Dashboard.css";

// Custom Active Shape for Pie Chart
const renderActiveShape = (props) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;

  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 10}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
    </g>
  );
};

// The earnings card is keyed on a calendar day, never on an instant. Qatar is
// UTC+3, so round-tripping a local midnight through toISOString() would hand the
// API the previous day. Keep it as a local "YYYY-MM-DD" string end to end.
const toLocalDateString = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseLocalDateString = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  const [year, month, day] = String(value).split("T")[0].split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

const getSourceIcon = (name) => {
  const normalized = String(name || "").toLowerCase();
  if (normalized.includes("google ads")) return "/icons/google_ads.svg";
  if (normalized.includes("google")) return "/icons/google.svg";
  if (normalized.includes("instagram")) return "/icons/instagram.svg";
  if (normalized.includes("facebook")) return "/icons/facebook.svg";
  if (normalized.includes("whatsapp")) return "/icons/whatsapp.svg";
  if (normalized.includes("business")) return "/icons/configurator.svg";
  if (normalized.includes("technician")) return "/icons/technician.svg";
  if (normalized.includes("app") || normalized.includes("store")) return "/icons/app_store.svg";
  return "/icons/job.svg";
};

function Dashboard() {
  const navigate = useNavigate();
  const { isFullAdmin } = useAdminRole();
  const [earningsTimeframe, setEarningsTimeframe] = useState("12months");
  const [jobsTimeframe, setJobsTimeframe] = useState("12months");
  const [activePieIndex, setActivePieIndex] = useState(0);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  
  // Initialize with today's date - use useMemo or lazy initialization
  const [selectedEarningsDate, setSelectedEarningsDate] = useState(() =>
    toLocalDateString(new Date())
  );

  // Server summary (preferred). Falls back to client aggregation if API not deployed yet.
  const {
    data: summary,
    isSuccess: summaryOk,
  } = useGetDashboardSummaryQuery(undefined, {
    pollingInterval: 30000,
    refetchOnFocus: true,
  });
  
  const { data: jobsData } = useGetJobsQuery({ limit: 1000 });
  const { data: techsData } = useGetTechniciansQuery({ limit: 1000 });
  const { data: vehiclesData } = useGetVehiclesQuery({ limit: 1000 });
  const { data: customersData } = useGetCustomersQuery({ limit: 1000 });
  const { data: insuranceData } = useGetVehicleInsurancesQuery({ limit: 1000 });
  const { data: sourcesData } = useGetSourcesQuery(undefined, { skip: summaryOk });
  const { data: sosListData } = useGetSOSRequestsQuery(
    { status: undefined, limit: 20 },
    { pollingInterval: 30000, skip: summaryOk }
  );
  
  // Dashboard analytics queries
  const { data: earningsData } = useGetEarningsDataQuery(earningsTimeframe, {
    skip: !isFullAdmin,
  });
  const { data: jobCompletionData } = useGetJobCompletionDataQuery(jobsTimeframe);
  const { data: techPerformanceData } = useGetAllTechniciansPerformanceQuery(undefined, {
    skip: !isFullAdmin,
  });
  const shouldFetchEarningsByDate = !!selectedEarningsDate && isFullAdmin;
  const { data: earningsByDateData, isLoading: earningsByDateLoading, error: earningsByDateError } = useGetEarningsByDateQuery(
    shouldFetchEarningsByDate ? selectedEarningsDate : null, 
    { skip: !shouldFetchEarningsByDate }
  );

  // Log whenever selectedEarningsDate changes
  useEffect(() => {
    // Effect hook for dependency tracking
  }, [selectedEarningsDate]);

  const jobs = jobsData?.jobs || [];
  const technicians = techsData?.technicians || [];
  const vehicles = vehiclesData?.vehicles || [];
  const customers = customersData?.customers || [];

  // Prefer server summary; keep legacy client calc as fallback.
  const submittedJobs = summaryOk ? summary.jobs.total : jobs.length;
  const completedJobs = summaryOk
    ? summary.jobs.completed
    : jobs.filter(j => j.job_status === "completed" || j.job_status === "paid" || j.job_status === "confirmed").length;
  const ongoingJobs = summaryOk
    ? summary.jobs.ongoing
    : jobs.filter(j => ["assigned", "accepted", "en_route", "arrived", "in_progress"].includes(j.job_status)).length;
  const pendingJobs = summaryOk
    ? summary.jobs.pending
    : jobs.filter(j => j.job_status === "pending").length;
  const activeTechs = summaryOk
    ? summary.technicians.active
    : technicians.filter(t => t.isActive).length;
  const totalVehicles = summaryOk ? summary.fleet.vehicles : vehicles.length;
  const totalClients = summaryOk ? summary.fleet.clients : customers.length;
  const insuredVehicles = summaryOk
    ? summary.fleet.insuredVehicles
    : (insuranceData?.total || 0);

  const techsOnline = summaryOk
    ? summary.technicians.online
    : technicians.filter((t) => t.isActive && t.currentStatus === "Online").length;
  const techsOnJob = summaryOk
    ? summary.technicians.onJob
    : technicians.filter((t) => t.isActive && t.currentStatus === "On Job").length;
  const jobsEnRoute = summaryOk
    ? summary.jobs.enRoute
    : jobs.filter((j) => j.job_status === "en_route").length;

  const sosOpen = summaryOk
    ? summary.sos.open
    : (sosListData?.requests || []).filter((s) =>
        ["pending", "in_call"].includes(s.status)
      ).length;

  // Calculate earnings - Total is all-time, Overall is based on selected date
  const totalEarnings = summaryOk
    ? summary.earnings.totalAllTime
    : jobs
        .filter(j => j.job_status === "completed" || j.job_status === "paid" || j.job_status === "confirmed")
        .reduce((sum, j) => sum + (parseFloat(j.price) || 0), 0);

  let overallEarnings = totalEarnings; // Default to total
  
  // If we have a selected date and data for it, use that for overall
  if (selectedEarningsDate && earningsByDateData?.totalEarnings !== undefined) {
    overallEarnings = earningsByDateData.totalEarnings;
  }

  const completedTrendPct = summaryOk ? summary.trends.completedJobsPct : null;
  const earningsTrendPct = summaryOk ? summary.trends.earningsPct : null;
  const statsComputedAt = summaryOk ? summary.stats_computed_at : null;

  const configuredSources = sourcesData?.sources || [];
  const sourceNameById = configuredSources.reduce((acc, source) => {
    acc[String(source._id)] = source.mainSourceName;
    return acc;
  }, {});

  const jobSources = (summaryOk
    ? (summary.sources?.top || [])
    : Object.values(
        jobs.reduce((acc, job) => {
          const sourceId = job.source?._id || job.source;
          const key = sourceId ? String(sourceId) : "unknown";
          const name =
            job.source?.mainSourceName ||
            sourceNameById[key] ||
            (key === "unknown" ? "Unknown" : "Source");
          if (isHiddenSourceName(name)) return acc;
          if (!acc[key]) {
            acc[key] = { name, count: 0 };
          }
          acc[key].count += 1;
          return acc;
        }, {})
      )
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .map((row) => ({
          ...row,
          percentage:
            submittedJobs > 0 ? Math.round((row.count / submittedJobs) * 100) : 0,
        }))
  ).filter((row) => !isHiddenSourceName(row.name));

  const jobSubSources = (summaryOk
    ? (summary.sources?.subSources || [])
    : Object.values(
        jobs.reduce((acc, job) => {
          const sub = getJobSourceSubLabel(job);
          if (!sub) return acc;
          const main = getSourceName(job) || sourceNameById[String(job.source?._id || job.source)] || "Unknown";
          if (isHiddenSourceName(main)) return acc;
          const key = `${main}::${sub}`;
          if (!acc[key]) {
            acc[key] = {
              name: sub,
              subSource: sub,
              sourceName: main,
              count: 0,
            };
          }
          acc[key].count += 1;
          return acc;
        }, {})
      )
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .map((row) => ({
          ...row,
          percentage:
            submittedJobs > 0 ? Math.round((row.count / submittedJobs) * 100) : 0,
        }))
  ).filter((row) => !isHiddenSourceName(row.sourceName));

  // Job status distribution
  const cancelledJobs = summaryOk
    ? summary.jobs.cancelled
    : jobs.filter(j => j.job_status === "cancelled").length;
  const jobStatusData = [
    { label: "Completed", value: completedJobs, percentage: Math.round((completedJobs / submittedJobs) * 100) || 0, color: "#039855" },
    { label: "Pending", value: pendingJobs, percentage: Math.round((pendingJobs / submittedJobs) * 100) || 0, color: "#F79009" },
    { label: "InProgress", value: ongoingJobs, percentage: Math.round((ongoingJobs / submittedJobs) * 100) || 0, color: "#1570EF" },
    { label: "Cancelled", value: cancelledJobs, percentage: Math.round((cancelledJobs / submittedJobs) * 100) || 0, color: "#DC6803" }
  ];

  // Get pending jobs sorted by date
  const pendingJobsList = summaryOk
    ? (summary.jobs.pendingList || [])
    : jobs
        .filter(j => j.job_status === "pending")
        .sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime))
        .slice(0, 5);

  const sosWaitingList = summaryOk
    ? (summary.sos.waitingList || [])
    : (sosListData?.requests || [])
        .filter((s) => ["pending", "in_call"].includes(s.status))
        .slice(0, 5)
        .map((s) => ({
          _id: s._id,
          status: s.status,
          createdAt: s.createdAt,
          customerName: s.customer?.name || "Customer",
          customerPhone: s.customer?.phone || "",
        }));

  // Top technicians by job acceptance rate
  const topTechnicians = technicians
    .map(tech => {
      const techJobs = jobs.filter(j => j.assignedTechnician?._id === tech._id || j.assignedTechnician === tech._id);
      const acceptedJobs = techJobs.filter(j => j.job_status !== "cancelled").length;
      const acceptanceRate = techJobs.length > 0 ? Math.round((acceptedJobs / techJobs.length) * 100) : 0;
      
      return {
        ...tech,
        acceptanceRate
      };
    })
    .sort((a, b) => b.acceptanceRate - a.acceptanceRate)
    .slice(0, 5);

  // Technician performance data from API
  const performanceChartData = techPerformanceData?.data || [];
  const maxPerformanceValue = Math.max(
    30,
    ...performanceChartData.map(d => d.completed + d.inProgress + d.cancelled)
  );

  const handleEarningsDateSelect = (date) => {
    // Convert Date object to a local calendar-day string to avoid Redux
    // serialization issues and any UTC day shift.
    const dateString = date instanceof Date ? toLocalDateString(date) : date;
    setSelectedEarningsDate(dateString);
  };

  const handleClearEarningsDate = () => {
    // Just close the modal, don't reset the date!
    setDatePickerOpen(false);
  };

  const formatDateForButton = (dateString) => {
    if (!dateString) return "Today";
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const dateObj = parseLocalDateString(dateString);
    if (!dateObj) return "Today";
    
    if (dateObj.getTime() === today.getTime()) return "Today";
    if (dateObj.getTime() === yesterday.getTime()) return "Yesterday";
    
    return dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-page-header">
        <h1 className="dashboard-title">Dashboard</h1>
        <p className="dashboard-subtitle">
          Live ops snapshot{summaryOk ? " · auto-refreshes every 30s" : ""}
        </p>
      </div>

      {/* Ops strip — dispatcher focus */}
      <div className="dashboard-ops-strip" role="navigation" aria-label="Live operations">
        <button
          type="button"
          className={`dashboard-ops-chip ${sosOpen > 0 ? "dashboard-ops-chip--alert" : ""}`}
          onClick={() => navigate("/sos")}
        >
          <span className="dashboard-ops-chip-label">Open SOS</span>
          <span className="dashboard-ops-chip-value">{sosOpen}</span>
        </button>
        <button
          type="button"
          className={`dashboard-ops-chip ${pendingJobs > 0 ? "dashboard-ops-chip--warn" : ""}`}
          onClick={() => navigate("/jobs")}
        >
          <span className="dashboard-ops-chip-label">Pending Jobs</span>
          <span className="dashboard-ops-chip-value">{pendingJobs}</span>
        </button>
        <button
          type="button"
          className="dashboard-ops-chip"
          onClick={() => navigate("/live-map")}
        >
          <span className="dashboard-ops-chip-label">Techs Online</span>
          <span className="dashboard-ops-chip-value">{techsOnline}</span>
        </button>
        <button
          type="button"
          className="dashboard-ops-chip"
          onClick={() => navigate("/live-map")}
        >
          <span className="dashboard-ops-chip-label">On Job</span>
          <span className="dashboard-ops-chip-value">{techsOnJob}</span>
        </button>
        <button
          type="button"
          className="dashboard-ops-chip"
          onClick={() => navigate("/jobs")}
        >
          <span className="dashboard-ops-chip-label">{getJobStatusLabel("en_route")}</span>
          <span className="dashboard-ops-chip-value">{jobsEnRoute}</span>
        </button>
      </div>

      {/* Metrics Grid */}
      <div className="dashboard-metrics-section">
        <div className="dashboard-metrics-grid">
          {/* Left Metrics */}
          <div className="dashboard-metrics-left">
            <div className="dashboard-metric-card">
              <div className="dashboard-metric-icon">
                <img src="/icons/li-newspaper.svg" alt="" />
              </div>
              <span className="dashboard-metric-label">Submitted Jobs</span>
              <span className="dashboard-metric-value">{submittedJobs}</span>
            </div>

            <div className="dashboard-metric-card">
              <div className="dashboard-metric-icon">
                <img src="/icons/li-check-check.svg" alt="" />
              </div>
              <span className="dashboard-metric-label">Completed Jobs</span>
              <span className="dashboard-metric-value">{completedJobs}</span>
              {completedTrendPct != null && (
                <span className={`dashboard-metric-trend ${completedTrendPct >= 0 ? "up" : "down"}`}>
                  {completedTrendPct >= 0 ? "+" : ""}
                  {completedTrendPct}% vs yesterday
                </span>
              )}
            </div>

            <div className="dashboard-metric-card">
              <div className="dashboard-metric-icon">
                <img src="/icons/li-indent-increase.svg" alt="" />
              </div>
              <span className="dashboard-metric-label">On Going Jobs</span>
              <span className="dashboard-metric-value">{ongoingJobs}</span>
            </div>

            <div className="dashboard-metric-card dashboard-metric-card-warning">
              <div className="dashboard-metric-icon">
                <img src="/icons/info.svg" alt="" />
              </div>
              <span className="dashboard-metric-label">Pending Jobs</span>
              <span className="dashboard-metric-value">{pendingJobs}</span>
            </div>

            <div className="dashboard-metric-card">
              <div className="dashboard-metric-icon">
                <img src="/icons/user.svg" alt="" />
              </div>
              <span className="dashboard-metric-label">Total Active Technicians</span>
              <span className="dashboard-metric-value">{activeTechs}</span>
            </div>

            <div className="dashboard-metric-card">
              <div className="dashboard-metric-icon">
                <img src="/icons/car.png" alt="" />
              </div>
              <span className="dashboard-metric-label">Total Vehicles</span>
              <span className="dashboard-metric-value">{totalVehicles}</span>
            </div>

            <div className="dashboard-metric-card">
              <div className="dashboard-metric-icon">
                <img src="/icons/users.svg" alt="" />
              </div>
              <span className="dashboard-metric-label">Total Clients</span>
              <span className="dashboard-metric-value">{totalClients}</span>
            </div>

            <div className="dashboard-metric-card">
              <div className="dashboard-metric-icon">
                <img src="/icons/li-heart-handshake.svg" alt="" />
              </div>
              <span className="dashboard-metric-label">Total Insured Vehicles</span>
              <span className="dashboard-metric-value">{insuredVehicles}</span>
            </div>
          </div>

          {isFullAdmin && (
          <div className="dashboard-earnings-card">
            <div className="dashboard-earnings-content">
              <div className="dashboard-earnings-main">
                <h3 className="dashboard-earnings-title">Total Earnings</h3>
                {statsComputedAt && (
                  <p className="dashboard-stats-as-of" style={{ fontSize: "0.75rem", color: "#667085", margin: 0 }}>
                    As of {new Date(statsComputedAt).toLocaleString()}
                  </p>
                )}
                <p className="dashboard-earnings-amount">{totalEarnings.toLocaleString()}</p>
                {earningsTrendPct != null && (
                  <span className={`dashboard-metric-trend ${earningsTrendPct >= 0 ? "up" : "down"}`}>
                    Today {earningsTrendPct >= 0 ? "+" : ""}
                    {earningsTrendPct}% vs yesterday
                  </span>
                )}
              </div>
              <div className="dashboard-earnings-chart">
                <img src="/icons/earnings-chart.svg" alt="Earnings trend" />
              </div>
            </div>
            <div className="dashboard-earnings-overall">
              <h3 className="dashboard-earnings-title">Overall Earnings</h3>
              <p className="dashboard-earnings-amount">{overallEarnings.toLocaleString()}</p>
            </div>
            <button 
              className="dashboard-earnings-button"
              onClick={() => setDatePickerOpen(!datePickerOpen)}
            >
              <img src="/icons/calendar.svg" alt="" />
              {formatDateForButton(selectedEarningsDate)}
            </button>
            
            {/* DatePicker Modal */}
            {datePickerOpen && (
              <div className="dashboard-datepicker-modal">
                <DatePicker
                  key={selectedEarningsDate}
                  value={parseLocalDateString(selectedEarningsDate)}
                  onChange={handleEarningsDateSelect}
                  onClose={handleClearEarningsDate}
                />
              </div>
            )}
          </div>
          )}
        </div>
      </div>

      {/* Charts Section */}
      <div className="dashboard-charts-section">
        {isFullAdmin && (
        <div className="dashboard-card">
          <div className="dashboard-card-header">
            <h3 className="dashboard-card-title">Earnings</h3>
            <div className="dashboard-tabs">
              {[
                { label: "12 months", value: "12months" },
                { label: "30 days", value: "30days" },
                { label: "7 days", value: "7days" },
                { label: "24 hours", value: "24hours" }
              ].map(tab => (
                <button
                  key={tab.value}
                  className={`dashboard-tab ${earningsTimeframe === tab.value ? 'dashboard-tab-active' : ''}`}
                  onClick={() => setEarningsTimeframe(tab.value)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          <div className="dashboard-chart-container">
            {earningsData && earningsData.data && earningsData.data.length > 0 ? (
              <div className="dashboard-recharts-wrapper">
                <p className="dashboard-chart-subtitle">Earnings of last {earningsTimeframe === "12months" ? "12 months" : earningsTimeframe === "30days" ? "30 days" : earningsTimeframe === "7days" ? "7 days" : "24 hours"}</p>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={earningsData.data} margin={{ top: 5, right: 0, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F2F4F7" />
                    <XAxis 
                      dataKey="date" 
                      stroke="#667085"
                      style={{ fontSize: '12px' }}
                    />
                    <YAxis 
                      stroke="#667085"
                      style={{ fontSize: '12px' }}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#fff', 
                        border: '1px solid #E4E7EC',
                        borderRadius: '8px'
                      }}
                      formatter={(value) => [`QR ${value.toFixed(2)}`, 'Earnings']}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="earnings" 
                      stroke="#DC6803" 
                      strokeWidth={2}
                      dot={{ fill: '#DC6803', r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="dashboard-chart-placeholder">
                <p>No earnings data for this period</p>
              </div>
            )}
          </div>
        </div>
        )}

        <div className="dashboard-card">
          <div className="dashboard-card-header">
            <h3 className="dashboard-card-title">Job Completion Trends</h3>
            <div className="dashboard-tabs">
              {[
                { label: "12 months", value: "12months" },
                { label: "30 days", value: "30days" },
                { label: "7 days", value: "7days" },
                { label: "24 hours", value: "24hours" }
              ].map(tab => (
                <button
                  key={tab.value}
                  className={`dashboard-tab ${jobsTimeframe === tab.value ? 'dashboard-tab-active' : ''}`}
                  onClick={() => setJobsTimeframe(tab.value)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          <div className="dashboard-chart-container">
            {jobCompletionData && jobCompletionData.data && jobCompletionData.data.length > 0 ? (
              <div className="dashboard-recharts-wrapper">
                <p className="dashboard-chart-subtitle">Analytics of last {jobsTimeframe === "12months" ? "12 months" : jobsTimeframe === "30days" ? "30 days" : jobsTimeframe === "7days" ? "7 days" : "24 hours"}</p>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={jobCompletionData.data} margin={{ top: 5, right: 0, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F2F4F7" />
                    <XAxis 
                      dataKey="date" 
                      stroke="#667085"
                      style={{ fontSize: '12px' }}
                    />
                    <YAxis 
                      stroke="#667085"
                      style={{ fontSize: '12px' }}
                      allowDecimals={false}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#fff', 
                        border: '1px solid #E4E7EC',
                        borderRadius: '8px'
                      }}
                      formatter={(value) => [value, 'Total No. of jobs']}
                    />
                    <Bar 
                      dataKey="jobs" 
                      fill="#F04438" 
                      radius={[8, 8, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="dashboard-chart-placeholder">
                <p>No job data for this period</p>
              </div>
            )}
          </div>
        </div>

        {isFullAdmin && (
        <div className="dashboard-card dashboard-performance-card">
          <h3 className="dashboard-card-title">Technician Performance</h3>
          
          <div className="dashboard-performance-legend">
            <div className="dashboard-performance-legend-item">
              <span className="dashboard-performance-legend-dot" style={{ backgroundColor: '#FDCBCB' }}></span>
              <span className="dashboard-performance-legend-label">Completed</span>
            </div>
            <div className="dashboard-performance-legend-item">
              <span className="dashboard-performance-legend-dot" style={{ backgroundColor: '#EA4949' }}></span>
              <span className="dashboard-performance-legend-label">InProgress</span>
            </div>
            <div className="dashboard-performance-legend-item">
              <span className="dashboard-performance-legend-dot" style={{ backgroundColor: '#B52020' }}></span>
              <span className="dashboard-performance-legend-label">Cancelled</span>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={performanceChartData} margin={{ top: 20, right: 0, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F2F4F7" />
              <XAxis 
                dataKey="name" 
                stroke="#667085"
                style={{ fontSize: '12px' }}
              />
              <YAxis 
                stroke="#667085"
                style={{ fontSize: '12px' }}
                allowDecimals={false}
                domain={[0, 'dataMax + 10']}
                ticks={[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#fff', 
                  border: '1px solid #E4E7EC',
                  borderRadius: '8px'
                }}
              />
              <Bar dataKey="completed" stackId="a" fill="#FDCBCB" radius={[0, 0, 0, 0]} />
              <Bar dataKey="inProgress" stackId="a" fill="#EA4949" radius={[0, 0, 0, 0]} />
              <Bar dataKey="cancelled" stackId="a" fill="#B52020" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        )}
      </div>

      {/* Bottom Section */}
      <div className="dashboard-bottom-section">
        <div className="dashboard-bottom-row">
          <div className="dashboard-bottom-left-column">
            {/* Job Status Distribution */}
            <div className="dashboard-card dashboard-job-status-card">
          <h3 className="dashboard-card-title">Job Status Distribution</h3>
          <div className="dashboard-pie-chart">
            <div className="dashboard-pie-chart-container">
              <ResponsiveContainer width={200} height={200}>
                <PieChart>
                  <Pie
                    activeIndex={activePieIndex}
                    activeShape={renderActiveShape}
                    data={jobStatusData.filter(item => item.value > 0)}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    dataKey="value"
                    onMouseEnter={(_, index) => setActivePieIndex(index)}
                  >
                    {jobStatusData.filter(item => item.value > 0).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <p className="dashboard-pie-center-text">{submittedJobs} Jobs</p>
            </div>
            <div className="dashboard-pie-legend">
              {jobStatusData.map((item, index) => (
                <div key={index} className="dashboard-legend-item">
                  <div className="dashboard-legend-label">
                    <span className="dashboard-legend-dot" style={{ backgroundColor: item.color }}></span>
                    <span>{item.label}</span>
                  </div>
                  <span className="dashboard-legend-value">{item.percentage}%</span>
                </div>
              ))}
            </div>
          </div>
            </div>

            <div className="dashboard-card dashboard-sources-card">
              <div className="dashboard-card-header dashboard-sources-card-header">
                <h3 className="dashboard-card-title">Job Sources</h3>
                <button
                  type="button"
                  className="dashboard-filter-btn"
                  onClick={() => navigate("/sources")}
                >
                  Manage
                </button>
              </div>
              <div className="dashboard-sources-list">
                {jobSources.length > 0 ? (
                  jobSources.map((source) => (
                    <div key={source.sourceId || source.name} className="dashboard-sources-item">
                      <div className="dashboard-sources-item-left">
                        <img
                          src={getSourceIcon(source.name)}
                          alt=""
                          className="dashboard-sources-icon"
                        />
                        <span className="dashboard-sources-name">{source.name}</span>
                      </div>
                      <div className="dashboard-sources-metrics">
                        <span className="dashboard-sources-count">
                          {source.count.toLocaleString()}
                        </span>
                        <span className="dashboard-sources-percentage">
                          {source.percentage}%
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="dashboard-no-pending">No source data yet</p>
                )}
              </div>
            </div>

            <div className="dashboard-card dashboard-sources-card">
              <div className="dashboard-card-header dashboard-sources-card-header">
                <h3 className="dashboard-card-title">Job Sub-Sources</h3>
                <button
                  type="button"
                  className="dashboard-filter-btn"
                  onClick={() => navigate("/sources")}
                >
                  Manage
                </button>
              </div>
              <div className="dashboard-sources-list">
                {jobSubSources.length > 0 ? (
                  jobSubSources.map((row) => (
                    <div
                      key={`${row.sourceName || row.sourceId || "unknown"}-${row.subSource || row.name}`}
                      className="dashboard-sources-item"
                    >
                      <div className="dashboard-sources-item-left">
                        <img
                          src={getSourceIcon(row.sourceName)}
                          alt=""
                          className="dashboard-sources-icon"
                        />
                        <div className="dashboard-sources-text">
                          <span className="dashboard-sources-name">{row.name}</span>
                          {row.sourceName ? (
                            <span className="dashboard-sources-parent">{row.sourceName}</span>
                          ) : null}
                        </div>
                      </div>
                      <div className="dashboard-sources-metrics">
                        <span className="dashboard-sources-count">
                          {row.count.toLocaleString()}
                        </span>
                        <span className="dashboard-sources-percentage">
                          {row.percentage}%
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="dashboard-no-pending">No sub-source data yet</p>
                )}
              </div>
            </div>
          </div>

          {/* Actionable queues */}
          <div className="dashboard-queues-column">
            <div className="dashboard-card dashboard-pending-jobs-card">
              <div className="dashboard-card-header">
                <h3 className="dashboard-card-title">Pending Jobs · {pendingJobs}</h3>
                <button
                  type="button"
                  className="dashboard-filter-btn"
                  onClick={() => navigate("/jobs")}
                >
                  View all
                </button>
              </div>
              <div className="dashboard-pending-jobs-list">
                {pendingJobsList.length > 0 ? (
                  pendingJobsList.map((job, index) => {
                    const jobDate = job.dateTime ? new Date(job.dateTime) : null;
                    const dateStr = jobDate
                      ? jobDate.toLocaleDateString("en-US", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        })
                      : "—";
                    const timeStr = jobDate
                      ? jobDate.toLocaleTimeString("en-US", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "";

                    return (
                      <button
                        type="button"
                        key={job._id}
                        className={`dashboard-pending-job-item ${index === 0 ? "active" : ""}`}
                        onClick={() => navigate(`/jobs/${job._id}`)}
                      >
                        <div className="dashboard-pending-job-time">
                          <span className="dashboard-pending-job-date">{dateStr}</span>
                          <span className="dashboard-pending-job-hour">{timeStr}</span>
                        </div>
                        <div className="dashboard-pending-job-details">
                          <span className="dashboard-pending-job-title">
                            {job.issue || job.jobType || "New Job Request"}
                            {(job.business_id || job.businessName) && (
                              <span
                                className="dashboard-business-tag"
                                title="Business portal job"
                              >
                                {job.businessName?.trim() || "Business"}
                              </span>
                            )}
                            {(job.created_by_technician || job.createdByTechnicianName) && (
                              <span
                                className="dashboard-technician-tag"
                                title="Technician-created job"
                              >
                                {job.createdByTechnicianName?.trim() || "Technician"}
                              </span>
                            )}
                          </span>
                          <span className="dashboard-pending-job-client">
                            {[job.clientName, job.clientMobileNumber]
                              .filter(Boolean)
                              .join(", ") || "Unknown client"}
                          </span>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <p className="dashboard-no-pending">No pending jobs</p>
                )}
              </div>
            </div>

            <div className="dashboard-card dashboard-sos-queue-card">
              <div className="dashboard-card-header">
                <h3 className="dashboard-card-title">
                  Waiting SOS · {sosOpen}
                </h3>
                <button
                  type="button"
                  className="dashboard-filter-btn"
                  onClick={() => navigate("/sos")}
                >
                  Open inbox
                </button>
              </div>
              <div className="dashboard-pending-jobs-list">
                {sosWaitingList.length > 0 ? (
                  sosWaitingList.map((sos, index) => {
                    const sosDate = sos.createdAt ? new Date(sos.createdAt) : null;
                    const dateStr = sosDate
                      ? sosDate.toLocaleDateString("en-US", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        })
                      : "—";
                    const timeStr = sosDate
                      ? sosDate.toLocaleTimeString("en-US", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "";

                    return (
                      <button
                        type="button"
                        key={sos._id}
                        className={`dashboard-pending-job-item dashboard-sos-queue-item ${
                          index === 0 ? "active" : ""
                        } ${sos.status === "in_call" ? "dashboard-sos-queue-item--call" : ""}`}
                        onClick={() => navigate("/sos")}
                      >
                        <div className="dashboard-pending-job-time">
                          <span className="dashboard-pending-job-date">{dateStr}</span>
                          <span className="dashboard-pending-job-hour">{timeStr}</span>
                        </div>
                        <div className="dashboard-pending-job-details">
                          <span className="dashboard-pending-job-title">
                            {sos.status === "in_call" ? "In call" : "Waiting for claim"}
                          </span>
                          <span className="dashboard-pending-job-client">
                            {[sos.customerName, sos.customerPhone]
                              .filter(Boolean)
                              .join(", ") || "Customer"}
                          </span>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <p className="dashboard-no-pending">No open SOS</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Top Technicians - Full Width */}
        <div className="dashboard-card dashboard-technicians-card">
          <div className="dashboard-card-header">
            <h3 className="dashboard-card-title">Technician Rankings</h3>
            <button className="dashboard-filter-btn">Filter</button>
          </div>
          <div className="dashboard-technicians-table">
            <div className="dashboard-table-header">
              <span className="dashboard-table-col-number">Number</span>
              <span className="dashboard-table-col-name">Name</span>
              <span className="dashboard-table-col-rate">Acceptance Rate</span>
            </div>
            {topTechnicians.map((tech, index) => (
              <div key={tech._id} className="dashboard-table-row">
                <span className="dashboard-table-number">{index + 1}.</span>
                <div className="dashboard-table-tech">
                  <img src={tech.profilePicture || "/icons/user.svg"} alt="" className="dashboard-tech-avatar" />
                  <span className="dashboard-tech-name">{tech.firstName} {tech.lastName}</span>
                </div>
                <span className="dashboard-table-rate">{tech.acceptanceRate}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
