import React from "react";
import "./SOSNotification.css";
import "./BusinessJobNotification.css";
import NotificationQueueNote from "./NotificationQueueNote.jsx";

function formatJobWhen(dateTime) {
  if (!dateTime) return "—";
  try {
    return new Date(dateTime).toLocaleString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(dateTime);
  }
}

function BusinessJobNotification({ jobData, onOpenJob, onDismiss, queueCount = 0 }) {
  const vehicle = jobData.vehicle || {};
  const location = jobData.location || {};
  const companyName =
    jobData.businessName?.trim() ||
    jobData.companyName?.trim() ||
    "Unknown business";
  const portalLabel = jobData.sourceLabel || "Business Portal";

  return (
    <div className="sos-notification-overlay biz-portal-overlay">
      <div className="sos-notification-modal biz-portal-modal">
        <div className="sos-header biz-portal-header">
          <div className="biz-portal-header-main">
            <span className="biz-portal-source-pill">{portalLabel}</span>
            <h2 className="sos-header-title biz-portal-title">New job submitted</h2>
            <p className="biz-portal-company-name">{companyName}</p>
          </div>
          <button className="sos-close-btn" onClick={onDismiss} type="button">
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M11 1L1 11M1 1L11 11"
                stroke="#98A2B3"
                strokeWidth="1.67"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        <div className="sos-content">
          <NotificationQueueNote queueCount={queueCount} />

          <div className="biz-portal-alert-banner">
            <span className="biz-portal-alert-label">Action required</span>
            <span className="biz-portal-alert-text">
              A partner business submitted a new job through the portal. Review details
              and assign a technician.
            </span>
          </div>

          <div className="sos-section">
            <h3 className="sos-section-title">Submission details</h3>
            <div className="sos-info-row">
              <div className="sos-info-group">
                <span className="sos-info-label">Source</span>
                <span className="sos-info-value biz-portal-source-value">
                  {portalLabel}
                </span>
              </div>
              <div className="sos-info-group">
                <span className="sos-info-label">Company</span>
                <span className="sos-info-value biz-portal-company-value">
                  {companyName}
                </span>
              </div>
            </div>
            <div className="sos-info-row">
              <div className="sos-info-group">
                <span className="sos-info-label">Scheduled</span>
                <span className="sos-info-value">
                  {formatJobWhen(jobData.dateTime)}
                </span>
              </div>
              <div className="sos-info-group">
                <span className="sos-info-label">Status</span>
                <span className="sos-info-value biz-portal-status-pending">
                  Pending assignment
                </span>
              </div>
            </div>
          </div>

          <div className="sos-section">
            <h3 className="sos-section-title">Customer information</h3>
            <div className="sos-info-row">
              <div className="sos-info-group">
                <span className="sos-info-label">Name</span>
                <span className="sos-info-value">
                  {jobData.clientName || "Unknown"}
                </span>
              </div>
              <div className="sos-info-group">
                <span className="sos-info-label">Contact number</span>
                <span className="sos-info-value">
                  {jobData.clientMobileNumber || "Unknown"}
                </span>
              </div>
            </div>
          </div>

          <div className="sos-section">
            <h3 className="sos-section-title">Vehicle details</h3>
            <div className="sos-info-row">
              <div className="sos-info-column">
                <div className="sos-info-group">
                  <span className="sos-info-label">Make</span>
                  <span className="sos-info-value">{vehicle.make || "Unknown"}</span>
                </div>
                <div className="sos-info-group">
                  <span className="sos-info-label">Year</span>
                  <span className="sos-info-value">{vehicle.year || "—"}</span>
                </div>
                <div className="sos-info-group">
                  <span className="sos-info-label">License plate</span>
                  <span className="sos-info-value">{vehicle.plate || "—"}</span>
                </div>
              </div>
              <div className="sos-info-column">
                <div className="sos-info-group">
                  <span className="sos-info-label">Model</span>
                  <span className="sos-info-value">
                    {vehicle.model || "Unknown"}
                  </span>
                </div>
                <div className="sos-info-group">
                  <span className="sos-info-label">Job type</span>
                  <span className="sos-info-value">
                    {jobData.jobType || "—"}
                  </span>
                </div>
                <div className="sos-info-group">
                  <span className="sos-info-label">Price</span>
                  <span className="sos-info-value">
                    {jobData.price != null ? `QR ${jobData.price}` : "—"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="sos-section">
            <h3 className="sos-section-title">Issue</h3>
            <p className="biz-job-issue">{jobData.issue || "—"}</p>
          </div>

          <div className="sos-section">
            <h3 className="sos-section-title">Location</h3>
            <span className="sos-info-value">
              {location.address || jobData.location || "Unknown"}
            </span>
          </div>

          <div className="sos-actions">
            <button
              type="button"
              className="sos-btn-create-job biz-portal-btn-primary"
              onClick={() => onOpenJob(jobData)}
            >
              View job &amp; assign technician
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BusinessJobNotification;
