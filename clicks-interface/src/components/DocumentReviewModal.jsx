import React, { useState } from "react";
import "./DocumentReviewModal.css";

const REJECT_REASONS = [
  "Incomplete or Invalid Documents",
  "Expired or Unverified Work Permit/License",
  "Your background verification did not meet the company’s eligibility criteria",
  "Insufficient Experience or Qualifications",
  "Inconsistent or Fraudulent Information",
  "Others"
];

export default function DocumentReviewModal({
  open,
  onClose,
  subtitle,
  documentImage,
  expiryDate,
  onApprove,
  onReject
}) {
  const [decision, setDecision] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [otherMessage, setOtherMessage] = useState("");
  const [checkbox, setCheckbox] = useState("");

  if (!open) return null;

  const handleApprove = () => {
    if (decision === "approve") {
      onApprove && onApprove();
      onClose();
    }
  };

  const handleReject = () => {
    if (decision === "reject" && checkbox) {
      onReject && onReject(checkbox === "Others" ? otherMessage : checkbox);
      onClose();
    }
  };

  // Determine modal height based on state
  let minHeight = 425;
  if (decision === "approve" || decision === "reject") minHeight = 641;
  if (decision === "reject" && checkbox) minHeight = 1023;

  return (
    <div className="doc-review-modal-backdrop">
      <div className="doc-review-modal" style={{ minHeight }}>
        <button className="doc-review-modal-close" onClick={onClose} aria-label="Close">
          <span className="doc-review-modal-close-x">&#10005;</span>
        </button>
        <div className="doc-review-modal-title">Documents</div>
        <div className="doc-review-modal-subtitle">{subtitle}</div>
        <div className="doc-review-modal-image-area">
          <img
            src={documentImage}
            alt="Document"
            className="doc-review-modal-image"
            width={366}
            height={241}
          />
        </div>
        <div className="doc-review-modal-expiry-row">
          <div className="doc-review-modal-expiry-label">Expiry Date</div>
          <div className="doc-review-modal-expiry-pill">{expiryDate}</div>
        </div>
        <div className="doc-review-modal-dropdown-row">
          <select
            className="doc-review-modal-dropdown"
            value={decision}
            onChange={e => setDecision(e.target.value)}
          >
            <option value="">Select</option>
            <option value="approve">Approve</option>
            <option value="reject">Reject</option>
          </select>
        </div>
        {decision === "approve" && (
          <div className="doc-review-modal-action-row">
            <button
              className="doc-review-modal-action-btn"
              style={{
                background: "#981F1F",
                color: "#fff",
                border: "1px solid #E4E7EC"
              }}
              onClick={handleApprove}
            >
              Approve Document
            </button>
          </div>
        )}
        {decision === "reject" && (
          <div className="doc-review-modal-reject-section">
            <div className="doc-review-modal-reject-title">Reason</div>
            <div className="doc-review-modal-reject-checkboxes">
              {REJECT_REASONS.map(reason => (
                <label
                  key={reason}
                  className="doc-review-modal-checkbox-label"
                  style={{ marginBottom: 20 }}
                >
                  <input
                    type="checkbox"
                    checked={checkbox === reason}
                    onChange={() => setCheckbox(reason)}
                  />
                  <span className="doc-review-modal-checkbox-text">{reason}</span>
                </label>
              ))}
            </div>
            {checkbox === "Others" && (
              <textarea
                className="doc-review-modal-textarea"
                style={{ width: 612, height: 70 }}
                placeholder="Enter your message"
                value={otherMessage}
                onChange={e => setOtherMessage(e.target.value)}
              />
            )}
            <div className="doc-review-modal-action-row" style={{ marginTop: 24 }}>
              <button
                className="doc-review-modal-action-btn"
                style={{
                  background: checkbox
                    ? "#981F1F"
                    : "#FFFFFF",
                  color: checkbox
                    ? "#fff"
                    : "#252525",
                  border: "1px solid #E4E7EC"
                }}
                disabled={!checkbox}
                onClick={handleReject}
              >
                Reject Document
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
