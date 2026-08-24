import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useListJobsQuery } from "../../store/portalApi";
import DataTable from "../../components/DataTable/DataTable.jsx";
import StatusPill from "../../components/StatusPill";
import "../../styles/jobs-page.css";
import "./Jobs.css";

function ClientInfoCell({ job }) {
  return (
    <div className="job-client-cell">
      <div className="job-client-name">{job.clientName || "—"}</div>
      <div className="job-client-mobile">{job.clientMobileNumber || ""}</div>
    </div>
  );
}

function JobActions({ onView }) {
  return (
    <div className="job-actions">
      <button
        type="button"
        className="job-action-btn"
        onClick={(e) => {
          e.stopPropagation();
          onView();
        }}
      >
        <img src="/icons/eye.svg" alt="View" />
      </button>
    </div>
  );
}

function Jobs() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const bucketParam = searchParams.get("bucket") || "all";
  const [bucket, setBucket] = useState(bucketParam);
  const [page, setPage] = useState(1);
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    const msg = location.state?.successMessage;
    if (msg) {
      setSuccessMessage(msg);
      navigate(location.pathname + location.search, { replace: true, state: {} });
    }
  }, [location, navigate]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    setBucket(bucketParam);
    setPage(1);
  }, [bucketParam]);

  // The server does the filtering — matching only the rows already on screen
  // hides every job outside the current page.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const {
    data: jobsData,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useListJobsQuery(
    { page, limit: 20, bucket, search: debouncedSearch },
    { pollingInterval: 25000 }
  );

  const jobs = jobsData?.jobs || [];
  const total = jobsData?.total ?? jobs.length;

  const columns = useMemo(
    () => [
      {
        title: "Job ID",
        key: "jobId",
        dataIndex: "jobId",
        width: "10%",
        render: (row) => (
          <span className="job-id-cell">
            {row.job_reference?.trim() ||
              (row._id ? `#${row._id.slice(-6)}` : "N/A")}
          </span>
        ),
      },
      {
        title: "Client Info",
        key: "clientInfo",
        dataIndex: "clientInfo",
        width: "18%",
        render: (row) => <ClientInfoCell job={row} />,
      },
      {
        title: "Job Type",
        key: "jobType",
        dataIndex: "jobType",
        width: "14%",
        render: (row) => row.jobType || "—",
      },
      {
        title: "Date & Time",
        key: "dateTime",
        dataIndex: "dateTime",
        width: "14%",
        render: (row) => {
          const value = row.dateTime || row.createdAt;
          const d = value ? new Date(value) : null;
          if (!d || Number.isNaN(d.getTime())) return "—";
          return (
            <div className="job-datetime-cell">
              <div className="job-date">{d.toLocaleDateString()}</div>
              <div className="job-time">{d.toLocaleTimeString()}</div>
            </div>
          );
        },
      },
      {
        title: "Price",
        key: "price",
        dataIndex: "price",
        width: "10%",
        render: (row) => (
          <span className="job-price-cell">QR {row.price ?? 0}</span>
        ),
      },
      {
        title: "Status",
        key: "status",
        dataIndex: "status",
        width: "14%",
        render: (row) => <StatusPill status={row.job_status} />,
      },
      {
        title: "Action",
        key: "action",
        dataIndex: "action",
        width: "8%",
        render: (row) => (
          <JobActions onView={() => navigate(`/jobs/${row._id}`)} />
        ),
      },
    ],
    [navigate]
  );

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
    <div className="jobs-container">
      {successMessage ? (
        <div className="biz-success-banner" role="status">
          {successMessage}
          <button
            type="button"
            className="biz-success-dismiss"
            onClick={() => setSuccessMessage("")}
          >
            ×
          </button>
        </div>
      ) : null}
      <div className="jobs-header-row">
        <span className="jobs-title">Job Management</span>
        <div className="jobs-header-actions">
          {isFetching && <span className="jobs-refreshing">Updating…</span>}
          <button
            type="button"
            className="jobs-add-btn"
            onClick={() => navigate("/jobs/new")}
          >
            + New Request
          </button>
        </div>
      </div>

      <DataTable
        title="Jobs"
        columns={columns}
        data={jobs}
        loading={isLoading && !jobsData}
        onSearch={(value) => {
          setSearch(value);
          setPage(1);
        }}
        onFilter={undefined}
        hideFilterIcon
        filterButtonText="Filter"
        onRowClick={(row) => navigate(`/jobs/${row._id}`)}
        pagination={{
          current: page,
          total,
          pageSize: 20,
          onChange: (nextPage) => setPage(nextPage),
        }}
        searchPlaceholder="Search jobs…"
        actionIcons={[]}
      />
    </div>
  );
}

export default Jobs;
