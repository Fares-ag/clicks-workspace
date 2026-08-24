import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Sector,
} from "recharts";
import { useDashboardQuery } from "../../store/portalApi";
import "./Dashboard.css";

function formatMoney(value) {
  const n = Number(value) || 0;
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatMoneyFull(value) {
  const n = Number(value) || 0;
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatJobWhen(job) {
  const raw = job.completed_at || job.createdAt;
  if (!raw) return { dateStr: "—", timeStr: "" };
  const d = new Date(raw);
  return {
    dateStr: d.toLocaleDateString("en-US", {
      weekday: "short",
      day: "numeric",
      month: "short",
    }),
    timeStr: d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

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
  const [activePieIndex, setActivePieIndex] = useState(0);
  const { data, isLoading, isError, refetch } = useDashboardQuery(undefined, {
    pollingInterval: 30000,
  });

  const totalCompleted = data?.totalCompleted ?? 0;
  const pendingAudit = data?.pendingAudit ?? 0;
  const audited = data?.audited ?? 0;
  const auditRate = data?.auditRate ?? 0;
  const totalNetProfit = data?.totalNetProfit ?? 0;
  const totalRevenue = data?.totalRevenue ?? 0;
  const totalCost = data?.totalCost ?? 0;
  const pendingAuditList = data?.pendingAuditList || [];
  const recentlyAudited = data?.recentlyAudited || [];

  const auditStatusData = [
    {
      label: "Audited",
      value: audited,
      percentage: totalCompleted
        ? Math.round((audited / totalCompleted) * 100)
        : 0,
      color: "#039855",
    },
    {
      label: "Not audited",
      value: pendingAudit,
      percentage: totalCompleted
        ? Math.round((pendingAudit / totalCompleted) * 100)
        : 0,
      color: "#F79009",
    },
  ];

  const pieData = auditStatusData.filter((item) => item.value > 0);

  return (
    <div className="dashboard-container">
      <div className="dashboard-page-header">
        <h1 className="dashboard-title">Dashboard</h1>
        <p className="dashboard-subtitle">
          Completed jobs audit queue · auto-refreshes every 30s
        </p>
      </div>

      {isError && !data ? (
        <div className="dashboard-load-error" role="alert">
          <span>
            Could not load the finance summary — the figures below are not live.
          </span>
          <button type="button" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      <div className="dashboard-ops-strip" role="navigation" aria-label="Finance ops">
        <button
          type="button"
          className={`dashboard-ops-chip ${pendingAudit > 0 ? "dashboard-ops-chip--warn" : ""}`}
          onClick={() => navigate("/jobs?status=pending")}
        >
          <span className="dashboard-ops-chip-label">Not audited</span>
          <span className="dashboard-ops-chip-value">
            {isLoading ? "…" : pendingAudit}
          </span>
        </button>
        <button
          type="button"
          className="dashboard-ops-chip"
          onClick={() => navigate("/jobs?status=audited")}
        >
          <span className="dashboard-ops-chip-label">Audited</span>
          <span className="dashboard-ops-chip-value">
            {isLoading ? "…" : audited}
          </span>
        </button>
        <button
          type="button"
          className="dashboard-ops-chip"
          onClick={() => navigate("/jobs")}
        >
          <span className="dashboard-ops-chip-label">Completed jobs</span>
          <span className="dashboard-ops-chip-value">
            {isLoading ? "…" : totalCompleted}
          </span>
        </button>
        <button type="button" className="dashboard-ops-chip" disabled style={{ cursor: "default" }}>
          <span className="dashboard-ops-chip-label">Audit rate</span>
          <span className="dashboard-ops-chip-value">
            {isLoading ? "…" : `${auditRate}%`}
          </span>
        </button>
      </div>

      <div className="dashboard-metrics-section">
        <div className="dashboard-metrics-grid">
          <div className="dashboard-metrics-left">
            <button
              type="button"
              className="dashboard-metric-card dashboard-metric-card-clickable"
              onClick={() => navigate("/jobs")}
            >
              <div className="dashboard-metric-icon">
                <img src="/icons/li-newspaper.svg" alt="" />
              </div>
              <span className="dashboard-metric-label">Completed Jobs</span>
              <span className="dashboard-metric-value">
                {isLoading ? "…" : totalCompleted.toLocaleString()}
              </span>
            </button>

            <button
              type="button"
              className="dashboard-metric-card dashboard-metric-card-clickable dashboard-metric-card-warning"
              onClick={() => navigate("/jobs?status=pending")}
            >
              <div className="dashboard-metric-icon">
                <img src="/icons/info.svg" alt="" />
              </div>
              <span className="dashboard-metric-label">Not Audited</span>
              <span className="dashboard-metric-value">
                {isLoading ? "…" : pendingAudit.toLocaleString()}
              </span>
            </button>

            <button
              type="button"
              className="dashboard-metric-card dashboard-metric-card-clickable"
              onClick={() => navigate("/jobs?status=audited")}
            >
              <div className="dashboard-metric-icon">
                <img src="/icons/li-check-check.svg" alt="" />
              </div>
              <span className="dashboard-metric-label">Audited Jobs</span>
              <span className="dashboard-metric-value">
                {isLoading ? "…" : audited.toLocaleString()}
              </span>
            </button>

            <div className="dashboard-metric-card">
              <div className="dashboard-metric-icon">
                <img src="/icons/li-indent-increase.svg" alt="" />
              </div>
              <span className="dashboard-metric-label">Audited Revenue</span>
              <span className="dashboard-metric-value">
                {isLoading ? "…" : formatMoney(totalRevenue)}
              </span>
            </div>

            <div className="dashboard-metric-card">
              <div className="dashboard-metric-icon">
                <img src="/icons/job.svg" alt="" />
              </div>
              <span className="dashboard-metric-label">Audited Costs</span>
              <span className="dashboard-metric-value">
                {isLoading ? "…" : formatMoney(totalCost)}
              </span>
            </div>

            <div className="dashboard-metric-card">
              <div className="dashboard-metric-icon">
                <img src="/icons/dashboard.svg" alt="" />
              </div>
              <span className="dashboard-metric-label">Audit Coverage</span>
              <span className="dashboard-metric-value">
                {isLoading ? "…" : `${auditRate}%`}
              </span>
            </div>
          </div>

          <div className="dashboard-earnings-card">
            <div className="dashboard-earnings-content">
              <div className="dashboard-earnings-main">
                <h3 className="dashboard-earnings-title">Total Net Profit</h3>
                <p className="dashboard-earnings-amount">
                  {isLoading ? "…" : formatMoney(totalNetProfit)}
                </p>
                <span className="dashboard-earnings-hint">
                  From audited jobs only
                </span>
              </div>
              <div className="dashboard-earnings-chart">
                <img src="/icons/earnings-chart.svg" alt="" />
              </div>
            </div>
            <div className="dashboard-earnings-overall">
              <h3 className="dashboard-earnings-title">Audited Revenue</h3>
              <p className="dashboard-earnings-amount dashboard-earnings-amount-sm">
                {isLoading ? "…" : formatMoney(totalRevenue)}
              </p>
            </div>
            <button
              type="button"
              className="dashboard-earnings-button"
              onClick={() => navigate("/jobs?status=pending")}
            >
              Review audit queue
            </button>
          </div>
        </div>
      </div>

      <div className="dashboard-bottom-section">
        <div className="dashboard-bottom-row">
          <div className="dashboard-card dashboard-job-status-card">
            <h3 className="dashboard-card-title">Audit Status Distribution</h3>
            <div className="dashboard-pie-chart">
              <div className="dashboard-pie-chart-container">
                {pieData.length > 0 ? (
                  <>
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
                    <p className="dashboard-pie-center-text">
                      {totalCompleted.toLocaleString()} Jobs
                    </p>
                  </>
                ) : (
                  <p className="dashboard-no-pending">No completed jobs yet</p>
                )}
              </div>
              <div className="dashboard-pie-legend">
                {auditStatusData.map((item) => (
                  <div key={item.label} className="dashboard-legend-item">
                    <div className="dashboard-legend-label">
                      <span
                        className="dashboard-legend-dot"
                        style={{ backgroundColor: item.color }}
                      />
                      <span>{item.label}</span>
                    </div>
                    <span className="dashboard-legend-value">
                      {item.percentage}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="dashboard-queues-column">
            <div className="dashboard-card dashboard-pending-jobs-card">
              <div className="dashboard-card-header">
                <h3 className="dashboard-card-title">
                  Not audited · {pendingAudit}
                </h3>
                <button
                  type="button"
                  className="dashboard-filter-btn"
                  onClick={() => navigate("/jobs?status=pending")}
                >
                  View all
                </button>
              </div>
              <div className="dashboard-pending-jobs-list">
                {pendingAuditList.length > 0 ? (
                  pendingAuditList.map((job, index) => {
                    const { dateStr, timeStr } = formatJobWhen(job);
                    return (
                      <button
                        type="button"
                        key={job._id}
                        className={`dashboard-pending-job-item ${index === 0 ? "active" : ""}`}
                        onClick={() => navigate(`/jobs/${job._id}`)}
                      >
                        <div className="dashboard-pending-job-time">
                          <span className="dashboard-pending-job-date">
                            {dateStr}
                          </span>
                          <span className="dashboard-pending-job-hour">
                            {timeStr}
                          </span>
                        </div>
                        <div className="dashboard-pending-job-details">
                          <span className="dashboard-pending-job-title">
                            {job.issue || job.jobType || "Completed job"}
                            {job.businessName ? (
                              <span className="dashboard-business-tag">
                                {job.businessName}
                              </span>
                            ) : null}
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
                  <p className="dashboard-no-pending">
                    {isLoading ? "Loading…" : "All caught up — nothing to audit"}
                  </p>
                )}
              </div>
            </div>

            <div className="dashboard-card dashboard-sos-queue-card">
              <div className="dashboard-card-header">
                <h3 className="dashboard-card-title">Recently audited</h3>
                <button
                  type="button"
                  className="dashboard-filter-btn"
                  onClick={() => navigate("/jobs?status=audited")}
                >
                  View all
                </button>
              </div>
              <div className="dashboard-pending-jobs-list">
                {recentlyAudited.length > 0 ? (
                  recentlyAudited.map((job) => (
                    <button
                      type="button"
                      key={job._id}
                      className="dashboard-pending-job-item"
                      onClick={() => navigate(`/jobs/${job._id}`)}
                    >
                      <div className="dashboard-pending-job-time">
                        <span className="dashboard-pending-job-date">
                          Profit
                        </span>
                        <span className="dashboard-pending-job-hour dashboard-profit-value">
                          QAR {formatMoneyFull(job.finance_net_profit)}
                        </span>
                      </div>
                      <div className="dashboard-pending-job-details">
                        <span className="dashboard-pending-job-title">
                          {job.clientName || "Job"}
                        </span>
                        <span className="dashboard-pending-job-client">
                          {job.finance_audited_at
                            ? new Date(job.finance_audited_at).toLocaleString()
                            : "—"}
                        </span>
                      </div>
                    </button>
                  ))
                ) : (
                  <p className="dashboard-no-pending">
                    {isLoading ? "Loading…" : "No audited jobs yet"}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
