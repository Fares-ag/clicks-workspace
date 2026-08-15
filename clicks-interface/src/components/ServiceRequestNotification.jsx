import React from "react";
import "./SOSNotification.css";
import NotificationQueueNote from "./NotificationQueueNote.jsx";

function ServiceRequestNotification({
  requestData,
  onCreateJob,
  onDismiss,
  queueCount = 0,
}) {
  const customer = requestData.customer || {};
  const vehicle = requestData.vehicle || {};
  const location = requestData.location || {};
  const when =
    requestData.timing === "scheduled" && requestData.scheduled_for
      ? `Scheduled · ${new Date(requestData.scheduled_for).toLocaleString()}`
      : "Needed now";

  return (
    <div className="sos-notification-overlay">
      <div className="sos-notification-modal">
        <div className="sos-header">
          <h2 className="sos-header-title">New Service Request</h2>
          <button className="sos-close-btn" type="button" onClick={onDismiss}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
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

          <div className="sos-section">
            <h3 className="sos-section-title">Service</h3>
            <div className="sos-info-row">
              <div className="sos-info-group">
                <span className="sos-info-label">Type</span>
                <span className="sos-info-value">
                  {requestData.service_type || "—"}
                </span>
              </div>
              <div className="sos-info-group">
                <span className="sos-info-label">When</span>
                <span className="sos-info-value">{when}</span>
              </div>
            </div>
          </div>

          <div className="sos-section">
            <h3 className="sos-section-title">Customer Information</h3>
            <div className="sos-info-row">
              <div className="sos-info-group">
                <span className="sos-info-label">Name</span>
                <span className="sos-info-value">{customer.name || "Unknown"}</span>
              </div>
              <div className="sos-info-group">
                <span className="sos-info-label">Contact Number</span>
                <span className="sos-info-value">{customer.phone || "Unknown"}</span>
              </div>
            </div>
          </div>

          <div className="sos-section">
            <h3 className="sos-section-title">Vehicle Details</h3>
            <div className="sos-info-row">
              <div className="sos-info-group">
                <span className="sos-info-label">Vehicle</span>
                <span className="sos-info-value">
                  {vehicle.make
                    ? `${vehicle.year || ""} ${vehicle.make} ${vehicle.model || ""}`.trim()
                    : "Not provided"}
                </span>
              </div>
              <div className="sos-info-group">
                <span className="sos-info-label">Plate</span>
                <span className="sos-info-value">{vehicle.plate || "—"}</span>
              </div>
            </div>
          </div>

          <div className="sos-section">
            <h3 className="sos-section-title">Location</h3>
            <span className="sos-info-value">
              {location.coordinates || "Unknown"}
            </span>
          </div>
        </div>

        <div className="sos-actions">
          <button
            className="sos-btn-create-job"
            type="button"
            style={{ background: "#fff", color: "#344054", borderColor: "#D0D5DD" }}
            onClick={onDismiss}
          >
            Dismiss
          </button>
          <button
            className="sos-btn-create-job"
            type="button"
            onClick={() => onCreateJob(requestData)}
          >
            Open Lead
          </button>
        </div>
      </div>
    </div>
  );
}

export default ServiceRequestNotification;
