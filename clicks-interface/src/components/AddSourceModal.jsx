import React, { useState } from "react";
import { useCreateSourceMutation } from "../store/sourceApi";
import "./AddSourceModal.css";

function AddSourceModal({ open, onClose, onSuccess }) {
  const [createSource, { isLoading }] = useCreateSourceMutation();
  
  const [formData, setFormData] = useState({
    mainSource: "",
    subSource: "",
    notes: ""
  });
  const [error, setError] = useState("");

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setError(""); // Clear error on input change
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    
    try {
      const payload = {
        mainSourceName: formData.mainSource,
        subSources: formData.subSource ? [{ name: formData.subSource, notes: formData.notes }] : []
      };

      await createSource(payload).unwrap();

      // Reset form
      setFormData({
        mainSource: "",
        subSource: "",
        notes: ""
      });
      
      onSuccess?.();
    } catch (error) {
      console.error("Error creating source:", error);
      setError(error.data?.message || "Failed to create source");
    }
  };

  const handleCancel = () => {
    setFormData({
      mainSource: "",
      subSource: "",
      notes: ""
    });
    setError("");
    onClose();
  };

  if (!open) return null;

  return (
    <div className="add-source-modal-backdrop">
      <div className="add-source-modal">
        <button className="add-source-modal-close" onClick={handleCancel} aria-label="Close">
          <span className="add-source-modal-close-x">&#10005;</span>
        </button>
        <form onSubmit={handleSubmit} autoComplete="off">
          <div className="add-source-modal-header">
            <div className="add-source-modal-title">Add New Source</div>
            <div className="add-source-modal-subtitle">Add your source details</div>
          </div>
          {error && (
            <div className="add-source-modal-error">
              {error}
            </div>
          )}
          <div className="add-source-modal-section">
            <div className="add-source-modal-section-title">Source Information</div>
            <div className="add-source-modal-fields">
              <div className="add-source-modal-row">
                <div className="add-source-modal-field">
                  <label>Main Source*</label>
                  <input
                    type="text"
                    name="mainSource"
                    value={formData.mainSource}
                    onChange={handleInputChange}
                    placeholder="e.g. Social Media"
                    required
                  />
                </div>
                <div className="add-source-modal-field">
                  <label>Sub Source*</label>
                  <input
                    type="text"
                    name="subSource"
                    value={formData.subSource}
                    onChange={handleInputChange}
                    placeholder="e.g. Instagram"
                    required
                  />
                </div>
              </div>
              <div className="add-source-modal-row">
                <div className="add-source-modal-field" style={{ width: 612 }}>
                  <label>Notes</label>
                  <textarea
                    name="notes"
                    value={formData.notes}
                    onChange={handleInputChange}
                    className="add-source-modal-textarea"
                    placeholder="Add any additional notes about this source..."
                    rows={4}
                  />
                </div>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
            <button className="add-source-modal-submit" type="submit" disabled={isLoading}>
              {isLoading ? "Adding..." : "Add Source"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddSourceModal;
