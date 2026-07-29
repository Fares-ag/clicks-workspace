import React from "react";
import "./SOSNotification.css";
import "./BusinessJobNotification.css";

function BusinessJobNotification({ jobData, onOpenJob, onDismiss }) {
  const vehicle = jobData.vehicle || {};
  const location = jobData.location || {};
  const businessLabel = jobData.businessName?.trim() || "Business";

  return (
    <div className="sos-notification-overlay">
      <div className="sos-notification-modal">
        <div className="sos-header">
          <div className="biz-job-header-titles">
            <h2 className="sos-header-title">New Business Job</h2>
            <span className="biz-job-header-tag" title="Business portal job">
              {businessLabel}
            </span>
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
          <div className="sos-section">
            <h3 className="sos-section-title">Customer Information</h3>
            <div className="sos-info-row">
              <div className="sos-info-group">
                <span className="sos-info-label">Name</span>
                <span className="sos-info-value">
                  {jobData.clientName || "Unknown"}
                </span>
              </div>
              <div className="sos-info-group">
                <span className="sos-info-label">Contact Number</span>
                <span className="sos-info-value">
                  {jobData.clientMobileNumber || "Unknown"}
                </span>
              </div>
            </div>
          </div>

          <div className="sos-section">
            <h3 className="sos-section-title">Vehicle Details</h3>
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
                  <span className="sos-info-label">License Plate</span>
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
                  <span className="sos-info-label">Job Type</span>
                  <span className="sos-info-value">
                    {jobData.jobType || "—"}
                  </span>
                </div>
                <div className="sos-info-group">
                  <span className="sos-info-label">Price</span>
                  <span className="sos-info-value">
                    {jobData.price != null ? `${jobData.price} QAR` : "—"}
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
              {location.address || "Unknown"}
            </span>
          </div>

          <div className="sos-actions">
            <button
              type="button"
              className="sos-btn-create-job"
              onClick={() => onOpenJob(jobData)}
            >
              Open job
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BusinessJobNotification;
