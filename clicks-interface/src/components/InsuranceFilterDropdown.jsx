import React, { useState, useRef, useEffect } from "react";
import CustomSelect from "./CustomSelect";
import "./FilterDropdown.css";

function InsuranceFilterDropdown({ open, onClose, onApply, anchorEl }) {
  const [status, setStatus] = useState("");
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (open && anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 8,
        left: rect.right - 320 // Align right edge of dropdown with button
      });
    }
  }, [open, anchorEl]);

  const statusOptions = [
    { value: "active", label: "Active" },
    { value: "expiring", label: "Expiring" },
    { value: "expired", label: "Expired" }
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
        style={{
          position: 'fixed',
          top: `${position.top}px`,
          left: `${position.left}px`
        }}
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

export default InsuranceFilterDropdown;
