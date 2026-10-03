import React from "react";
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

function timeframeLabel(value) {
  if (value === "12months") return "12 months";
  if (value === "30days") return "30 days";
  if (value === "7days") return "7 days";
  return "24 hours";
}

const TIMEFRAME_TABS = [
  { label: "12 months", value: "12months" },
  { label: "30 days", value: "30days" },
  { label: "7 days", value: "7days" },
  { label: "24 hours", value: "24hours" },
];

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

function DashboardCharts({
  isFullAdmin,
  earningsTimeframe,
  setEarningsTimeframe,
  earningsData,
  jobsTimeframe,
  setJobsTimeframe,
  jobCompletionData,
  performanceChartData,
}) {
  return (
    <>
      <div className="dashboard-charts-section">
        {isFullAdmin && (
          <div className="dashboard-card">
            <div className="dashboard-card-header">
              <h3 className="dashboard-card-title">Earnings</h3>
              <div className="dashboard-tabs">
                {TIMEFRAME_TABS.map((tab) => (
                  <button
                    key={tab.value}
                    className={`dashboard-tab ${earningsTimeframe === tab.value ? "dashboard-tab-active" : ""}`}
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
                  <p className="dashboard-chart-subtitle">
                    Earnings of last {timeframeLabel(earningsTimeframe)}
                  </p>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={earningsData.data} margin={{ top: 5, right: 0, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F2F4F7" />
                      <XAxis dataKey="date" stroke="#667085" style={{ fontSize: "12px" }} />
                      <YAxis stroke="#667085" style={{ fontSize: "12px" }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#fff",
                          border: "1px solid #E4E7EC",
                          borderRadius: "8px",
                        }}
                        formatter={(value) => [`QR ${value.toFixed(2)}`, "Earnings"]}
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
        )}

        <div className="dashboard-card">
          <div className="dashboard-card-header">
            <h3 className="dashboard-card-title">Job Completion Trends</h3>
            <div className="dashboard-tabs">
              {TIMEFRAME_TABS.map((tab) => (
                <button
                  key={tab.value}
                  className={`dashboard-tab ${jobsTimeframe === tab.value ? "dashboard-tab-active" : ""}`}
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
                <p className="dashboard-chart-subtitle">
                  Analytics of last {timeframeLabel(jobsTimeframe)}
                </p>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={jobCompletionData.data} margin={{ top: 5, right: 0, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F2F4F7" />
                    <XAxis dataKey="date" stroke="#667085" style={{ fontSize: "12px" }} />
                    <YAxis stroke="#667085" style={{ fontSize: "12px" }} allowDecimals={false} />
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

        {isFullAdmin && (
          <div className="dashboard-card dashboard-performance-card">
            <h3 className="dashboard-card-title">Technician Performance</h3>
            <div className="dashboard-performance-legend">
              <div className="dashboard-performance-legend-item">
                <span className="dashboard-performance-legend-dot" style={{ backgroundColor: "#FDCBCB" }} />
                <span className="dashboard-performance-legend-label">Completed</span>
              </div>
              <div className="dashboard-performance-legend-item">
                <span className="dashboard-performance-legend-dot" style={{ backgroundColor: "#EA4949" }} />
                <span className="dashboard-performance-legend-label">InProgress</span>
              </div>
              <div className="dashboard-performance-legend-item">
                <span className="dashboard-performance-legend-dot" style={{ backgroundColor: "#B52020" }} />
                <span className="dashboard-performance-legend-label">Cancelled</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={performanceChartData} margin={{ top: 20, right: 0, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F2F4F7" />
                <XAxis dataKey="name" stroke="#667085" style={{ fontSize: "12px" }} />
                <YAxis
                  stroke="#667085"
                  style={{ fontSize: "12px" }}
                  allowDecimals={false}
                  domain={[0, "dataMax + 10"]}
                  ticks={[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#fff",
                    border: "1px solid #E4E7EC",
                    borderRadius: "8px",
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
    </>
  );
}

export function JobStatusPie({
  jobStatusData,
  submittedJobs,
  activePieIndex,
  setActivePieIndex,
}) {
  const pieData = jobStatusData.filter((item) => item.value > 0);
  return (
    <div className="dashboard-card dashboard-job-status-card">
      <h3 className="dashboard-card-title">Job Status Distribution</h3>
      <div className="dashboard-pie-chart">
        <div className="dashboard-pie-chart-container">
          <ResponsiveContainer width={200} height={200}>
            <PieChart>
              <Pie
                activeIndex={activePieIndex}
                activeShape={renderActiveShape}
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                dataKey="value"
                onMouseEnter={(_, index) => setActivePieIndex(index)}
              >
                {pieData.map((entry, index) => (
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
                <span className="dashboard-legend-dot" style={{ backgroundColor: item.color }} />
                <span>{item.label}</span>
              </div>
              <span className="dashboard-legend-value">{item.percentage}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default DashboardCharts;
