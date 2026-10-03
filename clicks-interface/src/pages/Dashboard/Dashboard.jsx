import React, { useState, useEffect, Suspense, lazy } from "react";
import { useNavigate } from "react-router-dom";
import { getJobStatusLabel } from "../../utils/jobStatusLabels";
import { 
  useGetDashboardSummaryQuery,
  useGetEarningsDataQuery, 
  useGetJobCompletionDataQuery,
  useGetAllTechniciansPerformanceQuery,
  useGetEarningsByDateQuery
} from "../../store/dashboardApi";
import { isHiddenSourceName } from "../../utils/systemSources";
import DatePicker from "../../components/DatePicker";
import { useAdminRole } from "../../utils/adminRoles";
import { usePageVisible } from "../../hooks/usePageVisible";
import "./Dashboard.css";

const DashboardCharts = lazy(() => import("./DashboardCharts.jsx"));
const JobStatusPie = lazy(() =>
  import("./DashboardCharts.jsx").then((m) => ({ default: m.JobStatusPie }))
);

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
  const [earningsTimeframe, setEarningsTimeframe] = useState("30days");
  const [jobsTimeframe, setJobsTimeframe] = useState("30days");
  const [activePieIndex, setActivePieIndex] = useState(0);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  
  // Initialize with today's date - use useMemo or lazy initialization
  const [selectedEarningsDate, setSelectedEarningsDate] = useState(() =>
    toLocalDateString(new Date())
  );

  const pageVisible = usePageVisible();
  const {
    data: summary,
    isSuccess: summaryOk,
    isLoading: summaryLoading,
  } = useGetDashboardSummaryQuery(undefined, {
    pollingInterval: pageVisible ? 45000 : 0,
    refetchOnFocus: false,
  });
  
  const { data: earningsData } = useGetEarningsDataQuery(earningsTimeframe, {
    skip: !isFullAdmin || !summaryOk,
  });
  const { data: jobCompletionData } = useGetJobCompletionDataQuery(jobsTimeframe, {
    skip: !summaryOk,
  });
  const { data: techPerformanceData } = useGetAllTechniciansPerformanceQuery(undefined, {
    skip: !isFullAdmin || !summaryOk,
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

  const submittedJobs = summary?.jobs?.total ?? 0;
  const completedJobs = summary?.jobs?.completed ?? 0;
  const ongoingJobs = summary?.jobs?.ongoing ?? 0;
  const onHoldJobs = summary?.jobs?.onHold ?? 0;
  const pendingJobs = summary?.jobs?.pending ?? 0;
  const activeTechs = summary?.technicians?.active ?? 0;
  const totalVehicles = summary?.fleet?.vehicles ?? 0;
  const totalClients = summary?.fleet?.clients ?? 0;
  const insuredVehicles = summary?.fleet?.insuredVehicles ?? 0;
  const techsOnline = summary?.technicians?.online ?? 0;
  const techsOnJob = summary?.technicians?.onJob ?? 0;
  const jobsEnRoute = summary?.jobs?.enRoute ?? 0;
  const sosOpen = summary?.sos?.open ?? 0;
  const totalEarnings = summary?.earnings?.totalAllTime ?? 0;

  let overallEarnings = totalEarnings; // Default to total
  
  // If we have a selected date and data for it, use that for overall
  if (selectedEarningsDate && earningsByDateData?.totalEarnings !== undefined) {
    overallEarnings = earningsByDateData.totalEarnings;
  }

  const completedTrendPct = summary?.trends?.completedJobsPct ?? null;
  const earningsTrendPct = summary?.trends?.earningsPct ?? null;
  const statsComputedAt = summary?.stats_computed_at ?? null;

  const jobSources = (summary?.sources?.top || []).filter(
    (row) => !isHiddenSourceName(row.name)
  );

  const jobSubSources = (summary?.sources?.subSources || []).filter(
    (row) => !isHiddenSourceName(row.sourceName)
  );

  const cancelledJobs = summary?.jobs?.cancelled ?? 0;
  const jobStatusData = [
    { label: "Completed", value: completedJobs, percentage: Math.round((completedJobs / submittedJobs) * 100) || 0, color: "#039855" },
    { label: "Pending", value: pendingJobs, percentage: Math.round((pendingJobs / submittedJobs) * 100) || 0, color: "#F79009" },
    { label: "InProgress", value: ongoingJobs, percentage: Math.round((ongoingJobs / submittedJobs) * 100) || 0, color: "#1570EF" },
    { label: "On hold", value: onHoldJobs, percentage: Math.round((onHoldJobs / submittedJobs) * 100) || 0, color: "#F59E0B" },
    { label: "Cancelled", value: cancelledJobs, percentage: Math.round((cancelledJobs / submittedJobs) * 100) || 0, color: "#DC6803" }
  ];

  const pendingJobsList = summary?.jobs?.pendingList || [];
  const sosWaitingList = summary?.sos?.waitingList || [];

  const topTechnicians = (techPerformanceData?.data || []).slice(0, 5).map((row) => ({
    _id: row.technicianId,
    firstName: row.name,
    lastName: "",
    profilePicture: null,
    acceptanceRate:
      row.total > 0
        ? Math.round(((row.completed + row.inProgress) / row.total) * 100)
        : 0,
  }));

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
      {summaryLoading && !summaryOk ? (
        <p className="dashboard-subtitle" style={{ marginBottom: 16 }}>
          Loading dashboard…
        </p>
      ) : null}
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

            <div className="dashboard-metric-card">
              <div className="dashboard-metric-icon">
                <img src="/icons/info.svg" alt="" />
              </div>
              <span className="dashboard-metric-label">On Hold Jobs</span>
              <span className="dashboard-metric-value">{onHoldJobs}</span>
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

      <Suspense fallback={<div className="dashboard-charts-section" aria-hidden="true" />}>
        <DashboardCharts
          isFullAdmin={isFullAdmin}
          earningsTimeframe={earningsTimeframe}
          setEarningsTimeframe={setEarningsTimeframe}
          earningsData={earningsData}
          jobsTimeframe={jobsTimeframe}
          setJobsTimeframe={setJobsTimeframe}
          jobCompletionData={jobCompletionData}
          performanceChartData={performanceChartData}
        />
      </Suspense>

      {/* Bottom Section */}
      <div className="dashboard-bottom-section">
        <div className="dashboard-bottom-row">
          <div className="dashboard-bottom-left-column">
            {/* Job Status Distribution */}
            <Suspense fallback={<div className="dashboard-card dashboard-job-status-card" aria-hidden="true" />}>
              <JobStatusPie
                jobStatusData={jobStatusData}
                submittedJobs={submittedJobs}
                activePieIndex={activePieIndex}
                setActivePieIndex={setActivePieIndex}
              />
            </Suspense>

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
