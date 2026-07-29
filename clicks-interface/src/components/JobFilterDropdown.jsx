import React, { useState, useRef, useEffect } from "react";
import { useGetTechniciansQuery } from "../store/technicianApi";
import CustomSelect from "./CustomSelect";
import "./FilterDropdown.css";

function JobFilterDropdown({ open, onClose, onApply, anchorEl }) {
  const [status, setStatus] = useState("");
  const [technician, setTechnician] = useState("");
  const dropdownRef = useRef(null);
  const { data: techniciansData } = useGetTechniciansQuery();
  const allTechnicians = techniciansData?.technicians || [];

  const statusOptions = [
    { value: "pending", label: "Pending" },
    { value: "assigned", label: "Assigned" },
    { value: "accepted", label: "Accepted" },
    { value: "en_route", label: "En Route" },
    { value: "arrived", label: "Arrived" },
    { value: "in_progress", label: "In Progress" },
    { value: "completed", label: "Completed" },
    { value: "on_hold", label: "On Hold" },
    { value: "cancelled", label: "Cancelled" }
  ];

  const technicianOptions = allTechnicians.map(tech => ({
    value: `${tech.firstName} ${tech.lastName}`,
    label: `${tech.firstName} ${tech.lastName}`
  }));

  const handleApply = () => {
    onApply({ status, technician });
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

        <div className="filter-field">
          <label className="filter-label">Technician</label>
          <CustomSelect
            value={technician}
            onChange={setTechnician}
            options={technicianOptions}
            placeholder="Select technician"
            searchable
          />
        </div>

        <button className="filter-apply-btn" onClick={handleApply}>
          Apply
        </button>
      </div>
    </>
  );
}

export default JobFilterDropdown;
