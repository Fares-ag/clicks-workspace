import React, { useState, useEffect } from "react";
import { useGetVehicleMakesQuery } from "../store/vehicleConfigApi";
import "./AddVehicleConfigModal.css";

export default function AddVehicleConfigModal({ open, onClose, onSubmit, editing }) {
  const { data: makesData } = useGetVehicleMakesQuery();
  const makes = makesData?.makes || [];
  
  const [formData, setFormData] = useState({
    make: "",
    makeId: null,
    model: ""
  });
  const [showMakeDropdown, setShowMakeDropdown] = useState(false);
  const [filteredMakes, setFilteredMakes] = useState([]);

  useEffect(() => {
    if (editing) {
      setFormData({
        make: editing.make || "",
        makeId: editing.makeId || null,
        model: editing.model || ""
      });
    } else {
      setFormData({ make: "", makeId: null, model: "" });
    }
  }, [editing, open]);

  useEffect(() => {
    if (formData.make) {
      const filtered = makes.filter(m => 
        m.makeName.toLowerCase().includes(formData.make.toLowerCase())
      );
      setFilteredMakes(filtered);
      setShowMakeDropdown(filtered.length > 0 && formData.make.length > 0);
    } else {
      setFilteredMakes([]);
      setShowMakeDropdown(false);
    }
  }, [formData.make, makes]);

  if (!open) return null;

  const handleMakeChange = (e) => {
    setFormData({ ...formData, make: e.target.value, makeId: null });
  };

  const handleSelectMake = (make) => {
    setFormData({ ...formData, make: make.makeName, makeId: make._id });
    setShowMakeDropdown(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
    setFormData({ make: "", makeId: null, model: "" });
  };

  const handleClose = () => {
    setFormData({ make: "", makeId: null, model: "" });
    onClose();
  };

  return (
    <div className="add-vehicle-config-modal-backdrop" onClick={handleClose}>
      <div className="add-vehicle-config-modal" onClick={(e) => e.stopPropagation()}>
        {/* Close Button */}
        <button className="add-vehicle-config-modal-close" onClick={handleClose}>
          <div className="add-vehicle-config-modal-close-icon">✕</div>
        </button>

        <form onSubmit={handleSubmit}>
          {/* Title and Subtitle */}
          <div className="add-vehicle-config-modal-header">
            <h2 className="add-vehicle-config-modal-title">Vehicle Configuration</h2>
            <p className="add-vehicle-config-modal-subtitle">
              Please enter the vehicle make and model
            </p>
          </div>

          {/* Vehicle Information Section */}
          <div className="add-vehicle-config-modal-section">
            <h3 className="add-vehicle-config-modal-section-title">Vehicle Information:</h3>

            <div className="add-vehicle-config-modal-row">
              <div className="add-vehicle-config-modal-field">
                <label>Make*</label>
                <div className="add-vehicle-config-make-input-wrapper">
                  <input
                    type="text"
                    placeholder="Enter or select make"
                    value={formData.make}
                    onChange={handleMakeChange}
                    onFocus={() => formData.make && filteredMakes.length > 0 && setShowMakeDropdown(true)}
                    required
                  />
                  {showMakeDropdown && (
                    <div className="add-vehicle-config-make-dropdown">
                      {filteredMakes.map((make) => (
                        <div
                          key={make._id}
                          className="add-vehicle-config-make-dropdown-item"
                          onClick={() => handleSelectMake(make)}
                        >
                          {make.makeName}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="add-vehicle-config-modal-field">
                <label>Model*</label>
                <input
                  type="text"
                  placeholder="Enter model"
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  required
                />
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="add-vehicle-config-modal-footer">
            <button type="submit" className="add-vehicle-config-modal-submit">
              Submit
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
