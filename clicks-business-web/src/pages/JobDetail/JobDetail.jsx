import React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useGetJobQuery } from "../../store/portalApi";
import StatusPill from "../../components/StatusPill";
import { formatDateTime, statusLabel } from "../../utils/phone";
import { formatJobLocationDisplay } from "../../utils/formatJobLocationDisplay";
import { getJobStatusLabel } from "../../utils/jobStatusLabels";
import { jobTypeLabel } from "../../constants/jobTypes";
import "../../styles/add-new-job.css";
import "./JobDetail.css";

function DetailRow({ label, children }) {
  if (children == null || children === "") return null;
  return (
    <div className="job-detail-row">
      <div className="job-detail-label">{label}</div>
      <div className="job-detail-value">{children}</div>
    </div>
  );
}

function JobDetail() {
  const navigate = useNavigate();
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

  const vehicle = [job.vehicleMake, job.vehicleModel, job.vehicleYear]
    .filter((v) => v != null && String(v).trim() !== "")
    .join(" ");

  return (
    <div className="add-new-job-container job-detail-page">
      <div className="add-new-job-header job-detail-top">
        <button
          type="button"
          className="add-new-job-back"
          onClick={() => navigate("/jobs")}
        >
          <img src="/icons/long-arrow-left.svg" alt="Back" />
        </button>
        <div className="job-detail-heading">
          <h1 className="add-new-job-title">Job details</h1>
          <StatusPill status={job.job_status} />
        </div>
        <button
          type="button"
          className="btn-secondary job-detail-refresh"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="add-new-job-card">
        <div className="add-new-job-section">
          <h2 className="add-new-job-section-title">Client Details</h2>
          <DetailRow label="Name">{job.clientName}</DetailRow>
          <DetailRow label="Phone">{job.clientMobileNumber}</DetailRow>
          <DetailRow label="Email">{job.clientEmail}</DetailRow>
        </div>

        <div className="add-new-job-section">
          <h2 className="add-new-job-section-title">Vehicle</h2>
          <DetailRow label="Vehicle">{vehicle}</DetailRow>
          <DetailRow label="License plate">{job.licensePlate}</DetailRow>
          <DetailRow label="VIN">{job.vinNumber}</DetailRow>
        </div>

        <div className="add-new-job-section">
          <h2 className="add-new-job-section-title">Job Details</h2>
          <DetailRow label="Status">{getJobStatusLabel(job.job_status)}</DetailRow>
          {job.payment_status ? (
            <DetailRow label="Payment">{statusLabel(job.payment_status)}</DetailRow>
          ) : null}
          <DetailRow label="Type">{jobTypeLabel(job.jobType)}</DetailRow>
          <DetailRow label="Issue">{job.issue}</DetailRow>
          <DetailRow label="Location">{formatJobLocationDisplay(job)}</DetailRow>
          <DetailRow label="Price">{`${job.price ?? ""} QAR`}</DetailRow>
          {job.businessCutPercent != null ? (
            <DetailRow label="Your cut">
              {`${job.businessCutPercent}% (${job.businessCutType || "revenue"})`}
            </DetailRow>
          ) : null}
          <DetailRow label="When">{formatDateTime(job.dateTime)}</DetailRow>
        </div>
      </div>
    </div>
  );
}

export default JobDetail;
