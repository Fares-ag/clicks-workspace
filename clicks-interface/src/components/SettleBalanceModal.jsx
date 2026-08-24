import React, { useState } from "react";
import { useSettleBalanceMutation } from "../store/technicianApi";
import SuccessModal from "./SuccessModal";
import "./SettleBalanceModal.css";

export default function SettleBalanceModal({
  open,
  onClose,
  technicianId,
  currentBalance = 0,
  onSuccess
}) {
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [uploadedImage, setUploadedImage] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [settleBalance, { isLoading }] = useSettleBalanceMutation();
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  if (!open) return null;

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setUploadedFile(file);
      setUploadedImage(URL.createObjectURL(file));
      setShowUpload(true);
    }
  };

  const handleSettle = async () => {
    if (!amount || !uploadedFile) {
      setErrorMessage("Please enter amount and upload a receipt");
      return;
    }

    const settlementAmount = parseFloat(amount);

    if (!Number.isFinite(settlementAmount) || settlementAmount <= 0) {
      setErrorMessage("Please enter a valid settlement amount");
      return;
    }

    if (settlementAmount > currentBalance) {
      setErrorMessage("Settlement amount cannot exceed current balance");
      return;
    }

    try {
      // Go through RTK Query so the bearer token and the configured API host are
      // attached (a raw fetch sent neither).
      await settleBalance({
        id: technicianId,
        amount: settlementAmount,
        notes: notes || "Cash balance settlement"
      }).unwrap();

      // Close settle modal first
      onClose();
      
      // Then show success modal after a brief delay
      setTimeout(() => {
        setShowSuccessModal(true);
      }, 300);
      
      // Reset form
      setAmount("");
      setNotes("");
      setUploadedFile(null);
      setUploadedImage(null);
      setShowUpload(false);
      setErrorMessage("");
      
      // Trigger success callback
      onSuccess && onSuccess();
    } catch (error) {
      console.error("Settle balance error:", error);
      setErrorMessage(error?.data?.message || error?.message || "Failed to settle balance");
    }
  };

  return (
    <>
    <div className="settle-modal-backdrop">
      <div className="settle-modal">
        <button className="settle-modal-close" onClick={onClose} aria-label="Close">
          <span className="settle-modal-close-x">&#10005;</span>
        </button>
        <div className="settle-modal-title">Settle Cash Balance</div>
        <div className="settle-modal-balance-container">
          <div className="settle-modal-balance-label">Current Balance</div>
          <div className="settle-modal-balance-amount">QR {currentBalance}</div>
        </div>
        <div className="settle-modal-subtitle">Settlement Information:</div>
        <div className="settle-modal-label" style={{ marginTop: 20 }}>Settlement Amount*</div>
        <input
          className="settle-modal-input"
          type="number"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="Enter amount"
        />
        <div className="settle-modal-label" style={{ marginTop: 24 }}>Upload Receipt*</div>
        <label className="settle-modal-upload" style={{ marginBottom: 0 }}>
          <span className="settle-modal-upload-text">Upload File here</span>
          <img src="/icons/job.svg" alt="Upload" className="settle-modal-upload-icon" />
          <input type="file" accept="image/*" onChange={handleFileChange} />
        </label>
        {showUpload && (
          <div className="settle-modal-upload-preview" style={{ marginTop: 12 }}>
            <div className="settle-modal-upload-preview-header">Upload image here</div>
            <div className="settle-modal-upload-preview-photo" style={{ height: '150px' }}>
              {uploadedImage && (
                <img
                  src={uploadedImage}
                  alt="Receipt"
                  className="settle-modal-upload-thumbnail"
                  style={{ maxHeight: '140px', width: 'auto', objectFit: 'contain' }}
                />
              )}
            </div>
          </div>
        )}
        <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-start" }}>
          <button
            className="settle-modal-settle-btn"
            style={{
              background: amount && uploadedImage && !isLoading ? "#981F1F" : "#D0D5DD",
              color: "#fff"
            }}
            disabled={!amount || !uploadedImage || isLoading}
            onClick={handleSettle}
          >
            {isLoading ? "Settling..." : "Settle"}
          </button>
        </div>
        
        {errorMessage && (
          <div style={{ marginTop: 10, color: '#EF4444', fontSize: '14px' }}>
            {errorMessage}
          </div>
        )}
      </div>
    </div>
      
    <SuccessModal
      open={showSuccessModal}
      onClose={() => setShowSuccessModal(false)}
      title="Settlement Successful!"
      subtitle="The balance has been settled successfully."
    />
    </>
  );
}
