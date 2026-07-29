import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useDashboardQuery, useListJobsQuery } from "../../store/portalApi";
import StatusPill from "../../components/StatusPill";
import { formatDateTime } from "../../utils/phone";
import "../Dashboard/Dashboard.css";
import "./Jobs.css";

function Jobs() {
  const [searchParams, setSearchParams] = useSearchParams();
  const bucketParam = searchParams.get("bucket") || "all";
  const [bucket, setBucket] = useState(bucketParam);

  // Keep filter in sync when arriving from dashboard count links.
  useEffect(() => {
    setBucket(bucketParam);
  }, [bucketParam]);

  const { data: dashData } = useDashboardQuery(undefined, {
    pollingInterval: 25000,
  });

  const {
    data: jobsData,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useListJobsQuery(
    { page: 1, limit: 50, bucket },
    { pollingInterval: 25000 }
  );

  const counts = dashData?.counts || { open: 0, inProgress: 0, completed: 0 };
  const jobs = jobsData?.jobs || [];

  const setBucketAndUrl = (next) => {
    const value = bucket === next ? "all" : next;
    setBucket(value);
    if (value === "all") setSearchParams({});
    else setSearchParams({ bucket: value });
  };

  const listTitle =
    bucket === "all"
      ? "All jobs"
      : bucket === "open"
        ? "Open jobs"
        : bucket === "inProgress"
          ? "In progress"
          : "Completed jobs";

  const emptyCopy =
    bucket === "all"
      ? "No jobs yet. Create a New Job for a customer."
      : "No jobs in this filter.";

  if (isLoading && !jobsData) {
    return <div className="biz-loading">Loading jobs…</div>;
  }

  if (isError && !jobsData) {
    return (
      <div className="biz-empty">
        <p>Failed to load jobs.</p>
        <button type="button" className="btn-primary" onClick={() => refetch()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="jobs-page dashboard">
      <div className="admin-page-header jobs-page-header">
        <div>
          <h1 className="admin-page-title">Jobs</h1>
          <p className="admin-page-subtitle">
            Track roadside jobs created for your customers.
          </p>
        </div>
        <Link to="/jobs/new" className="btn-primary">
          New Job
        </Link>
      </div>

      <div className="count-cards">
        <button
          type="button"
          className={`count-card${bucket === "open" ? " selected" : ""}`}
          style={{ "--accent": "var(--color-primary)" }}
          onClick={() => setBucketAndUrl("open")}
        >
          <div className="count-value" style={{ color: "var(--color-primary)" }}>
            {counts.open}
          </div>
          <div className="count-label">Open</div>
        </button>
        <button
          type="button"
          className={`count-card${bucket === "inProgress" ? " selected" : ""}`}
          style={{ "--accent": "#00796B" }}
          onClick={() => setBucketAndUrl("inProgress")}
        >
          <div className="count-value" style={{ color: "#00796B" }}>
            {counts.inProgress}
          </div>
          <div className="count-label">In progress</div>
        </button>
        <button
          type="button"
          className={`count-card${bucket === "completed" ? " selected" : ""}`}
          style={{ "--accent": "#039855" }}
          onClick={() => setBucketAndUrl("completed")}
        >
          <div className="count-value" style={{ color: "#039855" }}>
            {counts.completed}
          </div>
          <div className="count-label">Completed</div>
        </button>
      </div>

      <section className="jobs-section">
        <div className="jobs-section-header">
          <h2>{listTitle}</h2>
          {isFetching && <span className="jobs-refreshing">Updating…</span>}
        </div>
        {jobs.length === 0 ? (
          <div className="biz-empty muted">{emptyCopy}</div>
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

export default Jobs;
