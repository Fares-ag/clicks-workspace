import React from "react";
import "./ConfirmationModal.css";

export default function ConfirmationModal({ open, onClose, onConfirm, title, message }) {
  if (!open) return null;

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <div className="confirmation-modal-backdrop">
      <div className="confirmation-modal">
        <button className="confirmation-modal-close" onClick={onClose} aria-label="Close">
          <span className="confirmation-modal-close-x">&#10005;</span>
        </button>
        <div className="confirmation-modal-content">
          <img
            src="/icons/warning.svg"
            alt="Warning"
            className="confirmation-modal-icon"
            width={90}
            height={90}
          />
          <div className="confirmation-modal-title">{title}</div>
          <div className="confirmation-modal-message">{message}</div>
          <div className="confirmation-modal-actions">
            <button className="confirmation-modal-cancel" onClick={onClose}>
              Cancel
            </button>
            <button className="confirmation-modal-confirm" onClick={handleConfirm}>
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
