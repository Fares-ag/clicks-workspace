import React, { useState, useRef, useEffect } from "react";
import CustomSelect from "./CustomSelect";
import "./FilterDropdown.css";

function VehicleFilterDropdown({ open, onClose, onApply, anchorEl }) {
  const [status, setStatus] = useState("");
  const dropdownRef = useRef(null);

  const statusOptions = [
    { value: "Active", label: "Active" },
    { value: "Inactive", label: "Inactive" }
  ];

  const handleApply = () => {
    onApply({ status });
    onClose();
  };

  if (!open) return null;

  return (
    <>
      <div className="filter-overlay" onClick={onClose} />
      <div 
        ref={dropdownRef}
        className="filter-dropdown"
      >
        <div className="filter-header">
          <span className="filter-title">Filter</span>
        </div>
        <div className="filter-subtitle">Select your filter by:</div>

        <div className="filter-field">
          <label className="filter-label">Status</label>
          <CustomSelect
            value={status}
            onChange={setStatus}
            options={statusOptions}
            placeholder="Select status"
          />
        </div>

        <button className="filter-apply-btn" onClick={handleApply}>
          Apply
        </button>
      </div>
    </>
  );
}

export default VehicleFilterDropdown;
