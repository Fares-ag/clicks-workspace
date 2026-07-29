import React, { useState, useEffect } from "react";
import { useGetSourceByIdQuery, useUpdateSourceMutation } from "../store/sourceApi";
import "./EditSourceModal.css";

function EditSourceModal({ open, onClose, sourceId, onSuccess }) {
  const { data: sourceData, isLoading: isFetching } = useGetSourceByIdQuery(sourceId, {
    skip: !sourceId || !open
  });
  const [updateSource, { isLoading }] = useUpdateSourceMutation();
  
  const [formData, setFormData] = useState({
    mainSource: "",
    subSources: []
  });
  const [newSubSource, setNewSubSource] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (sourceData?.source) {
      setFormData({
        mainSource: sourceData.source.mainSourceName,
        subSources: (sourceData.source.subSources || []).map(sub => ({
          _id: sub._id,
          name: sub.name,
          notes: sub.notes || ""
        }))
      });
      setNewSubSource("");
    }
  }, [sourceData]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setError("");
  };

  const handleAddSubSource = () => {
    const trimmed = newSubSource.trim();
    if (!trimmed) return;
    // Check for duplicates
    if (formData.subSources.some(sub => sub.name.toLowerCase() === trimmed.toLowerCase())) {
      setError("Sub-source already exists");
      return;
    }
    setFormData(prev => ({
      ...prev,
      subSources: [...prev.subSources, { name: trimmed, notes: "" }]
    }));
    setNewSubSource("");
    setError("");
  };

  const handleRemoveSubSource = (index) => {
    setFormData(prev => ({
      ...prev,
      subSources: prev.subSources.filter((_, i) => i !== index)
    }));
  };

  const handleEditSubSource = (index, newName) => {
    setFormData(prev => ({
      ...prev,
      subSources: prev.subSources.map((sub, i) => 
        i === index ? { ...sub, name: newName } : sub
      )
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    
    // Validate sub-source names aren't empty
    const emptySubSource = formData.subSources.find(sub => !sub.name.trim());
    if (emptySubSource) {
      setError("Sub-source names cannot be empty");
      return;
    }
    
    try {
      const payload = {
        id: sourceId,
        mainSourceName: formData.mainSource,
        subSources: formData.subSources.map(sub => ({
          ...(sub._id ? { _id: sub._id } : {}),
          name: sub.name.trim(),
          notes: sub.notes || ""
        }))
      };

      await updateSource(payload).unwrap();
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error("Error updating source:", error);
      setError(error.data?.message || "Failed to update source");
    }
  };

  const handleCancel = () => {
    setFormData({
      mainSource: "",
      subSources: []
    });
    setNewSubSource("");
    setError("");
    onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddSubSource();
    }
  };

  if (!open) return null;

  return (
    <div className="edit-source-modal-backdrop">
      <div className="edit-source-modal">
        <button className="edit-source-modal-close" onClick={handleCancel} aria-label="Close">
          <span className="edit-source-modal-close-x">&#10005;</span>
        </button>
        <form onSubmit={handleSubmit} autoComplete="off">
          <div className="edit-source-modal-header">
            <div className="edit-source-modal-title">Edit Source</div>
            <div className="edit-source-modal-subtitle">Update source details and manage sub-sources</div>
          </div>
          {error && (
            <div className="edit-source-modal-error">
              {error}
            </div>
          )}
          <div className="edit-source-modal-section">
            <div className="edit-source-modal-section-title">Source Information</div>
            <div className="edit-source-modal-fields">
              <div className="edit-source-modal-row">
                <div className="edit-source-modal-field">
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
              </div>
            </div>
          </div>

          <div className="edit-source-modal-section">
            <div className="edit-source-modal-section-title">Sub Sources</div>
            <div className="edit-source-subsources-container">
              {formData.subSources.length === 0 ? (
                <p className="edit-source-no-subsources">No sub-sources yet. Add one below.</p>
              ) : (
                <div className="edit-source-subsources-list">
                  {formData.subSources.map((sub, index) => (
                    <div key={sub._id || index} className="edit-source-subsource-item">
                      <input
                        type="text"
                        className="edit-source-subsource-input"
                        value={sub.name}
                        onChange={(e) => handleEditSubSource(index, e.target.value)}
                        placeholder="Sub-source name"
                      />
                      <button
                        type="button"
                        className="edit-source-subsource-remove"
                        onClick={() => handleRemoveSubSource(index)}
                        title="Remove sub-source"
                      >
                        &#10005;
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="edit-source-add-subsource">
                <input
                  type="text"
                  className="edit-source-add-subsource-input"
                  value={newSubSource}
                  onChange={(e) => setNewSubSource(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type new sub-source name..."
                />
                <button
                  type="button"
                  className="edit-source-add-subsource-btn"
                  onClick={handleAddSubSource}
                  disabled={!newSubSource.trim()}
                >
                  + Add
                </button>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
            <button className="edit-source-modal-submit" type="submit" disabled={isLoading || isFetching}>
              {isLoading ? "Updating..." : "Update Source"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default EditSourceModal;
