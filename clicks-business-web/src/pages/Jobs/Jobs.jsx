import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  const [searchParams] = useSearchParams();
  const bucketParam = searchParams.get("bucket") || "all";
  const [bucket, setBucket] = useState(bucketParam);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setBucket(bucketParam);
    setPage(1);
  }, [bucketParam]);

  const {
    data: jobsData,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useListJobsQuery(
    { page, limit: 20, bucket },
    { pollingInterval: 25000 }
  );

  const jobs = jobsData?.jobs || [];
  const total = jobsData?.total ?? jobs.length;

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter((job) => {
      const haystack = [
        job.clientName,
        job.clientMobileNumber,
        job.jobType,
        job.vehicleMake,
        job.vehicleModel,
        job._id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [jobs, search]);

  const columns = useMemo(
    () => [
      {
        title: "Job ID",
        key: "jobId",
        dataIndex: "jobId",
        width: "10%",
        render: (row) => (
          <span className="job-id-cell">
            {row._id?.slice(-8).toUpperCase() || "N/A"}
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
      <div className="jobs-header-row">
        <span className="jobs-title">Job Management</span>
        <div className="jobs-header-actions">
          {isFetching && <span className="jobs-refreshing">Updating…</span>}
          <button
            type="button"
            className="jobs-add-btn"
            onClick={() => navigate("/jobs/new")}
          >
            + New Job
          </button>
        </div>
      </div>

      <DataTable
        title="Jobs"
        columns={columns}
        data={filteredJobs}
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
          total: search.trim() ? filteredJobs.length : total,
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
