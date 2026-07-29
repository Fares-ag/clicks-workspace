import React from "react";
import "./SuccessModal.css";

export default function SuccessModal({ open, onClose, title, subtitle }) {
  if (!open) return null;

  return (
    <div className="success-modal-backdrop">
      <div className="success-modal">
        <button className="success-modal-close" onClick={onClose} aria-label="Close">
          <span className="success-modal-close-x">&#10005;</span>
        </button>
        <div className="success-modal-content">
          <img
            src="/images/star.png"
            alt="Success"
            className="success-modal-star"
            width={90}
            height={90}
          />
          <div className="success-modal-title">{title}</div>
          <div className="success-modal-subtitle">{subtitle}</div>
        </div>
      </div>
    </div>
  );
}
