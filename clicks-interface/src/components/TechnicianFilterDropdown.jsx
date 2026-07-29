import React, { useState, useRef, useEffect } from "react";
import CustomSelect from "./CustomSelect";
import "./FilterDropdown.css";

function TechnicianFilterDropdown({ open, onClose, onApply, anchorEl }) {
  const [status, setStatus] = useState("");
  const [application, setApplication] = useState("");
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
    { value: "Online", label: "Online" },
    { value: "Offline", label: "Offline" }
  ];

  const applicationOptions = [
    { value: "Approved", label: "Approved" },
    { value: "Pending", label: "Pending" },
    { value: "Rejected", label: "Rejected" }
  ];

  const handleApply = () => {
    onApply({ status, application });
    onClose();
  };

  if (!open) return null;

  return (
    <>
      <div className="filter-overlay" onClick={onClose} />
      <div 
        ref={dropdownRef}
        className="filter-dropdown tech-filter-dropdown"
        style={{
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

        <div className="filter-field">
          <label className="filter-label">Application</label>
          <CustomSelect
            value={application}
            onChange={setApplication}
            options={applicationOptions}
            placeholder="Select Application"
          />
        </div>

        <button className="filter-apply-btn" onClick={handleApply}>
          Apply
        </button>
      </div>
    </>
  );
}

export default TechnicianFilterDropdown;
