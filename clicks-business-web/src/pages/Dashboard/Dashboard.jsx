import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  useAnalyticsQuery,
  useDashboardQuery,
  useListJobsQuery,
} from "../../store/portalApi";
import StatusPill from "../../components/StatusPill";
import { formatDateTime, formatMoney } from "../../utils/phone";
import "./Dashboard.css";

const PERIODS = [
  { id: "today", label: "Today" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "all", label: "All" },
];

function Dashboard() {
  const [period, setPeriod] = useState("month");

  const {
    data: dashData,
    isLoading: dashLoading,
    isError: dashError,
    refetch: refetchDash,
  } = useDashboardQuery(undefined, {
    pollingInterval: 25000,
  });

  const { data: analytics, refetch: refetchAnalytics } = useAnalyticsQuery(
    period,
    { pollingInterval: 25000 }
  );

  const { data: jobsData, isLoading: jobsLoading, refetch: refetchJobs } =
    useListJobsQuery(
      { page: 1, limit: 5, bucket: "all" },
      { pollingInterval: 25000 }
    );

  const counts = dashData?.counts || { open: 0, inProgress: 0, completed: 0 };
  const jobs = jobsData?.jobs || [];
  const byJobType = analytics?.byJobType || {};

  const initialLoading = dashLoading && jobsLoading && !dashData && !jobsData;

  if (initialLoading) {
    return <div className="biz-loading">Loading dashboard…</div>;
  }

  if (dashError && !dashData) {
    return (
      <div className="biz-empty">
        <p>Failed to load dashboard.</p>
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            refetchDash();
            refetchJobs();
            refetchAnalytics();
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="admin-page-header" style={{ marginBottom: 8 }}>
        <h1 className="admin-page-title" style={{ margin: 0 }}>
          Dashboard
        </h1>
      </div>

      <section className="dash-card analytics-card">
        <div className="dash-card-header">
          <h2>Analytics</h2>
          <div className="period-chips">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`period-chip${period === p.id ? " active" : ""}`}
                onClick={() => setPeriod(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="earnings-value">
          {formatMoney(analytics?.estimatedEarnings ?? 0)} QAR
        </div>
        <div className="earnings-label">Estimated earnings (your cut)</div>
        <div className="metrics-row">
          <div className="metric">
            <div className="metric-value">{analytics?.jobsCreated ?? 0}</div>
            <div className="metric-label">Created</div>
          </div>
          <div className="metric">
            <div className="metric-value">{analytics?.jobsCompleted ?? 0}</div>
            <div className="metric-label">Completed</div>
          </div>
          <div className="metric">
            <div className="metric-value">{analytics?.jobsCancelled ?? 0}</div>
            <div className="metric-label">Cancelled</div>
          </div>
        </div>
        {Object.keys(byJobType).length > 0 && (
          <div className="by-type">
            <div className="by-type-title">By job type (completed)</div>
            {Object.entries(byJobType).map(([type, info]) => (
              <div key={type} className="by-type-row">
                <span>{type}</span>
                <span>
                  {info.count ?? 0} · {formatMoney(info.estimatedEarnings ?? 0)}{" "}
                  QAR
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="count-cards">
        <Link to="/jobs?bucket=open" className="count-card count-card-link">
          <div className="count-value" style={{ color: "var(--color-primary)" }}>
            {counts.open}
          </div>
          <div className="count-label">Open</div>
        </Link>
        <Link
          to="/jobs?bucket=inProgress"
          className="count-card count-card-link"
        >
          <div className="count-value" style={{ color: "#00796B" }}>
            {counts.inProgress}
          </div>
          <div className="count-label">In progress</div>
        </Link>
        <Link
          to="/jobs?bucket=completed"
          className="count-card count-card-link"
        >
          <div className="count-value" style={{ color: "#039855" }}>
            {counts.completed}
          </div>
          <div className="count-label">Completed</div>
        </Link>
      </div>

      <section className="jobs-section">
        <div className="jobs-section-header">
          <h2>Recent jobs</h2>
          <Link to="/jobs" className="view-all-link">
            View all
          </Link>
        </div>
        {jobs.length === 0 ? (
          <div className="biz-empty muted">
            No jobs yet. Create a New Job for a customer.
          </div>
        ) : (
          <div className="job-list">
            {jobs.map((job) => (
              <Link key={job._id} to={`/jobs/${job._id}`} className="job-row">
                <div className="job-row-main">
                  <div className="job-client">{job.clientName || "—"}</div>
                  <div className="job-sub">
                    {[job.jobType, job.vehicleMake, job.vehicleModel]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                <div className="job-row-side">
                  <StatusPill status={job.job_status} />
                  <div className="job-when">
                    {formatDateTime(job.dateTime || job.createdAt)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default Dashboard;
