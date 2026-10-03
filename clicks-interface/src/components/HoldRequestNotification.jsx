import React from "react";
import "./HoldRequestNotification.css";
import "./SOSNotification.css";
import NotificationQueueNote from "./NotificationQueueNote.jsx";

function HoldRequestNotification({
  holdData,
  onOpenJob,
  onDismiss,
  queueCount = 0,
}) {
  const clientName = holdData?.clientName || "Customer";
  const reason = holdData?.reason?.trim() || "No reason provided.";

  return (
    <div className="sos-notification-overlay">
      <div className="sos-notification-modal hold-request-notification-modal">
        <div className="sos-header">
          <div className="biz-job-header-titles">
            <h2 className="sos-header-title">Hold Request</h2>
            <span className="biz-job-header-tag hold-request-header-tag">
              Pending review
            </span>
          </div>
          <button className="sos-close-btn" onClick={onDismiss} type="button">
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
            <h3 className="sos-section-title">Job</h3>
            <div className="sos-info-row">
              <div className="sos-info-group">
                <span className="sos-info-label">Customer</span>
                <span className="sos-info-value">{clientName}</span>
              </div>
            </div>
            <div className="sos-info-group hold-request-reason">
              <span className="sos-info-label">Reason</span>
              <span className="sos-info-value">{reason}</span>
            </div>
          </div>
        </div>

        <div className="sos-footer">
          <button type="button" className="sos-dismiss-btn" onClick={onDismiss}>
            Dismiss
          </button>
          <button type="button" className="sos-action-btn" onClick={onOpenJob}>
            Open job
          </button>
        </div>
      </div>
    </div>
  );
}

export default HoldRequestNotification;
