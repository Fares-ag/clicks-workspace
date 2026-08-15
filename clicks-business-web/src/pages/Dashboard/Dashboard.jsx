import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Sector,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  useDashboardSummaryQuery,
  useDashboardEarningsQuery,
  useDashboardJobCompletionQuery,
  useDashboardEarningsByDateQuery,
} from "../../store/portalApi";
import DatePicker from "../../components/DatePicker.jsx";
import "./Dashboard.css";

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

function Dashboard() {
  const navigate = useNavigate();
  const [earningsTimeframe, setEarningsTimeframe] = useState("12months");
  const [jobsTimeframe, setJobsTimeframe] = useState("12months");
  const [activePieIndex, setActivePieIndex] = useState(0);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [selectedEarningsDate, setSelectedEarningsDate] = useState(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today.toISOString();
  });

  const { data: summary, isSuccess: summaryOk } = useDashboardSummaryQuery(
    undefined,
    { pollingInterval: 30000, refetchOnFocus: true }
  );

  const { data: earningsData } = useDashboardEarningsQuery(earningsTimeframe);
  const { data: jobCompletionData } = useDashboardJobCompletionQuery(jobsTimeframe);
  const { data: earningsByDateData } = useDashboardEarningsByDateQuery(
    selectedEarningsDate
  );

  const submittedJobs = summaryOk ? summary.jobs.total : 0;
  const completedJobs = summaryOk ? summary.jobs.completed : 0;
  const ongoingJobs = summaryOk ? summary.jobs.ongoing : 0;
  const pendingJobs = summaryOk ? summary.jobs.pending : 0;
  const cancelledJobs = summaryOk ? summary.jobs.cancelled : 0;

  const totalEarnings = summaryOk ? summary.earnings.totalAllTime : 0;
  let overallEarnings = totalEarnings;
  if (selectedEarningsDate && earningsByDateData?.totalEarnings !== undefined) {
    overallEarnings = earningsByDateData.totalEarnings;
  }

  const completedTrendPct = summaryOk ? summary.trends.completedJobsPct : null;
  const earningsTrendPct = summaryOk ? summary.trends.earningsPct : null;

  const jobStatusData = [
    {
      label: "Completed",
      value: completedJobs,
      percentage: Math.round((completedJobs / submittedJobs) * 100) || 0,
      color: "#039855",
    },
    {
      label: "Pending",
      value: pendingJobs,
      percentage: Math.round((pendingJobs / submittedJobs) * 100) || 0,
      color: "#F79009",
    },
    {
      label: "InProgress",
      value: ongoingJobs,
      percentage: Math.round((ongoingJobs / submittedJobs) * 100) || 0,
      color: "#1570EF",
    },
    {
      label: "Cancelled",
      value: cancelledJobs,
      percentage: Math.round((cancelledJobs / submittedJobs) * 100) || 0,
      color: "#DC6803",
    },
  ];

  const pendingJobsList = summaryOk ? summary.jobs.pendingList || [] : [];

  const handleEarningsDateSelect = (date) => {
    setSelectedEarningsDate(date instanceof Date ? date.toISOString() : date);
  };

  const formatDateForButton = (dateString) => {
    if (!dateString) return "Today";

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const dateObj = new Date(dateString);
    dateObj.setHours(0, 0, 0, 0);

    if (dateObj.getTime() === today.getTime()) return "Today";
    if (dateObj.getTime() === yesterday.getTime()) return "Yesterday";
    return dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-page-header">
        <h1 className="dashboard-title">Dashboard</h1>
        <p className="dashboard-subtitle">
          Your jobs & earnings{summaryOk ? " · auto-refreshes every 30s" : ""}
        </p>
      </div>

      <div className="dashboard-metrics-section">
        <div className="dashboard-metrics-grid">
          <div className="dashboard-metrics-left dashboard-metrics-left--compact">
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
                <span
                  className={`dashboard-metric-trend ${completedTrendPct >= 0 ? "up" : "down"}`}
                >
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
          </div>

          <div className="dashboard-earnings-card">
            <div className="dashboard-earnings-content">
              <div className="dashboard-earnings-main">
                <h3 className="dashboard-earnings-title">Total Earnings</h3>
                <p className="dashboard-earnings-amount">
                  {totalEarnings.toLocaleString()}
                </p>
                {earningsTrendPct != null && (
                  <span
                    className={`dashboard-metric-trend ${earningsTrendPct >= 0 ? "up" : "down"}`}
                  >
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
              <p className="dashboard-earnings-amount">
                {overallEarnings.toLocaleString()}
              </p>
            </div>
            <button
              type="button"
              className="dashboard-earnings-button"
              onClick={() => setDatePickerOpen(!datePickerOpen)}
            >
              <img src="/icons/calendar.svg" alt="" />
              {formatDateForButton(selectedEarningsDate)}
            </button>

            {datePickerOpen && (
              <div className="dashboard-datepicker-modal">
                <DatePicker
                  key={selectedEarningsDate}
                  value={selectedEarningsDate}
                  onChange={handleEarningsDateSelect}
                  onClose={() => setDatePickerOpen(false)}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="dashboard-charts-section">
        <div className="dashboard-card">
          <div className="dashboard-card-header">
            <h3 className="dashboard-card-title">Earnings</h3>
            <div className="dashboard-tabs">
              {[
                { label: "12 months", value: "12months" },
                { label: "30 days", value: "30days" },
                { label: "7 days", value: "7days" },
                { label: "24 hours", value: "24hours" },
              ].map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  className={`dashboard-tab ${earningsTimeframe === tab.value ? "dashboard-tab-active" : ""}`}
                  onClick={() => setEarningsTimeframe(tab.value)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          <div className="dashboard-chart-container">
            {earningsData?.data?.length > 0 ? (
              <div className="dashboard-recharts-wrapper">
                <p className="dashboard-chart-subtitle">
                  Estimated earnings (your cut) for the selected period
                </p>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart
                    data={earningsData.data}
                    margin={{ top: 5, right: 0, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#F2F4F7" />
                    <XAxis dataKey="date" stroke="#667085" style={{ fontSize: "12px" }} />
                    <YAxis stroke="#667085" style={{ fontSize: "12px" }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#fff",
                        border: "1px solid #E4E7EC",
                        borderRadius: "8px",
                      }}
                      formatter={(value) => [`QR ${Number(value).toFixed(2)}`, "Earnings"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="earnings"
                      stroke="#DC6803"
                      strokeWidth={2}
                      dot={{ fill: "#DC6803", r: 4 }}
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

        <div className="dashboard-card">
          <div className="dashboard-card-header">
            <h3 className="dashboard-card-title">Job Completion Trends</h3>
            <div className="dashboard-tabs">
              {[
                { label: "12 months", value: "12months" },
                { label: "30 days", value: "30days" },
                { label: "7 days", value: "7days" },
                { label: "24 hours", value: "24hours" },
              ].map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  className={`dashboard-tab ${jobsTimeframe === tab.value ? "dashboard-tab-active" : ""}`}
                  onClick={() => setJobsTimeframe(tab.value)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          <div className="dashboard-chart-container">
            {jobCompletionData?.data?.length > 0 ? (
              <div className="dashboard-recharts-wrapper">
                <p className="dashboard-chart-subtitle">
                  Completed jobs for the selected period
                </p>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={jobCompletionData.data}
                    margin={{ top: 5, right: 0, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#F2F4F7" />
                    <XAxis dataKey="date" stroke="#667085" style={{ fontSize: "12px" }} />
                    <YAxis
                      stroke="#667085"
                      style={{ fontSize: "12px" }}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#fff",
                        border: "1px solid #E4E7EC",
                        borderRadius: "8px",
                      }}
                      formatter={(value) => [value, "Total No. of jobs"]}
                    />
                    <Bar dataKey="jobs" fill="#F04438" radius={[8, 8, 0, 0]} />
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
      </div>

      <div className="dashboard-bottom-section">
        <div className="dashboard-bottom-row dashboard-bottom-row--single-queue">
          <div className="dashboard-card dashboard-job-status-card">
            <h3 className="dashboard-card-title">Job Status Distribution</h3>
            <div className="dashboard-pie-chart">
              <div className="dashboard-pie-chart-container">
                <ResponsiveContainer width={200} height={200}>
                  <PieChart>
                    <Pie
                      activeIndex={activePieIndex}
                      activeShape={renderActiveShape}
                      data={jobStatusData.filter((item) => item.value > 0)}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      dataKey="value"
                      onMouseEnter={(_, index) => setActivePieIndex(index)}
                    >
                      {jobStatusData
                        .filter((item) => item.value > 0)
                        .map((entry, index) => (
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
                      <span
                        className="dashboard-legend-dot"
                        style={{ backgroundColor: item.color }}
                      />
                      <span>{item.label}</span>
                    </div>
                    <span className="dashboard-legend-value">{item.percentage}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

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
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
