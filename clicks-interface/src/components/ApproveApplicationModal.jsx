import React, { useState } from "react";
import { useUpdateTechnicianMutation } from "../store/technicianApi";
import SuccessModal from "./SuccessModal";
import "./ApproveApplicationModal.css";

export default function ApproveApplicationModal({ open, onClose, technician, onSuccess }) {
  const [status, setStatus] = useState("Approved");
  const [updateTechnician, { isLoading }] = useUpdateTechnicianMutation();
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      await updateTechnician({ 
        id: technician._id, 
        applicationStatus: status 
      }).unwrap();
      
      // Show success modal with appropriate message
      setSuccessMessage(
        status === "Approved" 
          ? "Application approved successfully!" 
          : "Application rejected successfully!"
      );
      setShowSuccess(true);
      
      // Call onSuccess callback after a short delay
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1500);
    } catch (err) {
      console.error("Failed to update application status:", err);
      // Show error message in success modal (can be styled as error)
      setSuccessMessage("Failed to update application status. Please try again.");
      setShowSuccess(true);
    }
  };

  return (
    <>
      <div className="approve-app-modal-backdrop" onClick={onClose}>
      <div className="approve-app-modal" onClick={(e) => e.stopPropagation()}>
        <button className="approve-app-modal-close" onClick={onClose}>
          <div className="approve-app-modal-close-icon">✕</div>
        </button>
        
        <div className="approve-app-modal-header">
          <h2 className="approve-app-modal-title">Documents</h2>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Work Permit Front */}
          <div className="approve-app-modal-section">
            <div className="approve-app-modal-doc-group">
              <h3 className="approve-app-modal-doc-title">Work Permit Front</h3>
              <div className="approve-app-modal-image-preview">
                {technician.workPermitFront ? (
                  <img src={technician.workPermitFront} alt="Work Permit Front" />
                ) : (
                  <div className="approve-app-modal-no-image">No document uploaded</div>
                )}
              </div>
            </div>
          </div>

          {/* Work Permit Back */}
          <div className="approve-app-modal-section">
            <div className="approve-app-modal-doc-group">
              <h3 className="approve-app-modal-doc-title">Work Permit Back</h3>
              <div className="approve-app-modal-image-preview">
                {technician.workPermitBack ? (
                  <img src={technician.workPermitBack} alt="Work Permit Back" />
                ) : (
                  <div className="approve-app-modal-no-image">No document uploaded</div>
                )}
              </div>
            </div>
          </div>

          {/* Driving License Front */}
          <div className="approve-app-modal-section">
            <div className="approve-app-modal-doc-group">
              <h3 className="approve-app-modal-doc-title">Driving License Front</h3>
              <div className="approve-app-modal-image-preview">
                {technician.drivingLicenseFront ? (
                  <img src={technician.drivingLicenseFront} alt="Driving License Front" />
                ) : (
                  <div className="approve-app-modal-no-image">No document uploaded</div>
                )}
              </div>
            </div>
          </div>

          {/* Driving License Back */}
          <div className="approve-app-modal-section">
            <div className="approve-app-modal-doc-group">
              <h3 className="approve-app-modal-doc-title">Driving License Back</h3>
              <div className="approve-app-modal-image-preview">
                {technician.drivingLicenseBack ? (
                  <img src={technician.drivingLicenseBack} alt="Driving License Back" />
                ) : (
                  <div className="approve-app-modal-no-image">No document uploaded</div>
                )}
              </div>
            </div>
          </div>

          {/* Expiry Date */}
          <div className="approve-app-modal-expiry-row">
            <span className="approve-app-modal-expiry-label">Expiry Date*</span>
            <div className="approve-app-modal-date-display">
              <img src="/icons/configurator.svg" alt="Calendar" className="approve-app-modal-calendar-icon" />
              <span>{technician.workPermitExpiration || technician.drivingLicenseExpiration || "Not set"}</span>
            </div>
          </div>

          {/* Status Dropdown */}
          <div className="approve-app-modal-status-section">
            <select 
              value={status} 
              onChange={(e) => setStatus(e.target.value)}
              className="approve-app-modal-status-select"
            >
              <option value="Approved">Approve</option>
              <option value="Rejected">Reject</option>
            </select>
          </div>

          {/* Submit Button */}
          <div className="approve-app-modal-footer">
            <button 
              className={`approve-app-modal-submit${status === 'Approved' ? ' approve-app-modal-submit-approve' : ''}`}
              type="submit" 
              disabled={isLoading}
            >
              {isLoading ? "Processing..." : status === 'Approved' ? "Approve Application" : "Reject Document"}
            </button>
          </div>
        </form>
      </div>
    </div>

    <SuccessModal
      open={showSuccess}
      onClose={() => setShowSuccess(false)}
      title={successMessage}
    />
    </>
  );
}
