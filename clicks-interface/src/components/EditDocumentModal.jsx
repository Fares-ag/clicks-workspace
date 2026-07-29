import React, { useState } from "react";
import { useUploadDocumentsMutation } from "../store/technicianApi";
import "./AddTechnicianModal.css"; // Reuse the same styling

export default function EditDocumentModal({ open, onClose, technicianId, documentType, onSuccess }) {
  const [files, setFiles] = useState({});
  const [expiryDate, setExpiryDate] = useState("");
  const [uploadDocuments, { isLoading }] = useUploadDocumentsMutation();

  if (!open) return null;

  const handleFileChange = (field, e) => {
    const file = e.target.files[0];
    if (file) {
      setFiles(prev => ({ ...prev, [field]: file }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!expiryDate) {
      alert("Please select an expiry date");
      return;
    }

    const formData = new FormData();
    Object.keys(files).forEach(key => {
      if (files[key]) {
        formData.append(key, files[key]);
      }
    });
    
    // Add expiry date
    if (documentType === 'workPermit') {
      formData.append('workPermitExpiration', expiryDate);
    } else {
      formData.append('drivingLicenseExpiration', expiryDate);
    }

    try {
      await uploadDocuments({ id: technicianId, formData }).unwrap();
      onSuccess?.();
      onClose();
      // Reset form
      setFiles({});
      setExpiryDate("");
    } catch (err) {
      console.error("Failed to upload documents:", err);
      alert("Failed to upload documents. Please try again.");
    }
  };

  const getFields = () => {
    if (documentType === 'workPermit') {
      return [
        { name: 'workPermitFront', label: 'Work Permit Front' },
        { name: 'workPermitBack', label: 'Work Permit Back' }
      ];
    }
    return [
      { name: 'drivingLicenseFront', label: 'Driving License Front' },
      { name: 'drivingLicenseBack', label: 'Driving License Back' }
    ];
  };

  return (
    <div className="add-admin-modal-backdrop" onClick={onClose}>
      <div className="add-admin-modal" onClick={(e) => e.stopPropagation()}>
        <button className="add-admin-modal-close" onClick={onClose}>
          ✕
        </button>
        
        <div className="add-admin-modal-header">
          <h2 className="add-admin-modal-title">Update Documents</h2>
          <p className="add-admin-modal-subtitle">
            Upload new {documentType === 'workPermit' ? 'work permit' : 'driving license'} documents
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="add-admin-modal-form">
            {getFields().map(field => (
              <div key={field.name} className="add-tech-modal-field" style={{ width: 612 }}>
                <label>{field.label}*</label>
                <label className="add-tech-modal-upload">
                  <span className="add-tech-modal-upload-text">
                    {files[field.name] ? files[field.name].name : "Upload File here"}
                  </span>
                  <img src="/icons/job.svg" alt="Upload" className="add-tech-modal-upload-icon" />
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => handleFileChange(field.name, e)}
                  />
                </label>
              </div>
            ))}

            {/* Expiry Date Picker */}
            <div className="add-tech-modal-field" style={{ width: 612, marginTop: 16 }}>
              <label>Expiry Date*</label>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="add-admin-modal-input"
                required
              />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
            <button 
              className="add-admin-modal-submit" 
              type="submit" 
              disabled={isLoading || Object.keys(files).length === 0 || !expiryDate}
            >
              {isLoading ? "Uploading..." : "Submit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
