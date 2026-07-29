import React from "react";
import { Link, useParams } from "react-router-dom";
import { useGetJobQuery } from "../../store/portalApi";
import StatusPill from "../../components/StatusPill";
import { formatDateTime, statusLabel } from "../../utils/phone";
import "./JobDetail.css";

function DetailRow({ label, children }) {
  if (children == null || children === "") return null;
  return (
    <div className="detail-row">
      <div className="detail-label">{label}</div>
      <div className="detail-value">{children}</div>
    </div>
  );
}

function JobDetail() {
  const { id } = useParams();
  const { data, isLoading, isError, isFetching, refetch } = useGetJobQuery(id, {
    pollingInterval: 20000,
    skip: !id,
  });

  const job = data?.job;

  if (isLoading && !job) {
    return <div className="biz-loading">Loading job…</div>;
  }

  if ((isError || !job) && !isLoading) {
    return (
      <div className="biz-empty">
        <p>Job not found.</p>
        <button type="button" className="btn-primary" onClick={() => refetch()}>
          Retry
        </button>
        <div style={{ marginTop: 12 }}>
          <Link to="/jobs">← Back to jobs</Link>
        </div>
      </div>
    );
  }

  const tech = job.assignedTechnician;
  let techName = "Not assigned yet";
  let techPhone = null;
  if (tech && typeof tech === "object") {
    techName = `${tech.firstName || ""} ${tech.lastName || ""}`.trim() || "Assigned";
    techPhone = tech.phone || null;
  }

  const vehicle = [job.vehicleMake, job.vehicleModel, job.vehicleYear]
    .filter((v) => v != null && String(v).trim() !== "")
    .join(" ");

  return (
    <div className="job-detail">
      <div className="job-detail-header">
        <div>
          <Link to="/jobs" className="back-link">
            ← Back to jobs
          </Link>
          <h1>Job details</h1>
        </div>
        <button
          type="button"
          className="secondary-btn"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <section className="detail-card">
        <div className="detail-title-row">
          <div>
            <h2>{job.clientName || "—"}</h2>
            <div className="detail-muted">{job.clientMobileNumber}</div>
            {job.clientEmail ? (
              <div className="detail-muted">{job.clientEmail}</div>
            ) : null}
          </div>
          <StatusPill status={job.job_status} />
        </div>

        <DetailRow label="Status">{statusLabel(job.job_status)}</DetailRow>
        {job.payment_status ? (
          <DetailRow label="Payment">{statusLabel(job.payment_status)}</DetailRow>
        ) : null}
        <DetailRow label="Issue">{job.issue}</DetailRow>
        <DetailRow label="Type">{job.jobType}</DetailRow>
        {vehicle ? <DetailRow label="Vehicle">{vehicle}</DetailRow> : null}
        {job.licensePlate ? (
          <DetailRow label="Plate">{job.licensePlate}</DetailRow>
        ) : null}
        {job.vinNumber ? <DetailRow label="VIN">{job.vinNumber}</DetailRow> : null}
        <DetailRow label="Location">{job.location}</DetailRow>
        <DetailRow label="Price">{`${job.price ?? ""} QAR`}</DetailRow>
        {job.businessCutPercent != null ? (
          <DetailRow label="Your cut">
            {`${job.businessCutPercent}% (${job.businessCutType || "revenue"})`}
          </DetailRow>
        ) : null}
        <DetailRow label="When">{formatDateTime(job.dateTime)}</DetailRow>
        <DetailRow label="Technician">{techName}</DetailRow>
        {techPhone ? (
          <DetailRow label="Tech phone">
            <a className="call-link" href={`tel:${techPhone}`}>
              Call {techPhone}
            </a>
          </DetailRow>
        ) : null}
      </section>
    </div>
  );
}

export default JobDetail;
