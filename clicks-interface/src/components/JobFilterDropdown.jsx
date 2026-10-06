import React, { useState, useEffect } from "react";
import { useGetTechniciansQuery } from "../store/technicianApi";
import { useGetSourcesQuery } from "../store/sourceApi";
import CustomSelect from "./CustomSelect";
import { getJobStatusFilterOptions } from "../utils/jobStatusLabels";
import { JOB_TYPE_OPTIONS } from "../constants/jobTypes";
import "./FilterDropdown.css";

export const EMPTY_JOB_FILTERS = {
  status: "",
  technician: "",
  dateFrom: "",
  dateTo: "",
  timeFrom: "",
  timeTo: "",
  paymentStatus: "",
  jobType: "",
  source: "",
  jobOrigin: "",
};

const ORIGIN_OPTIONS = [
  { value: "", label: "Any origin" },
  { value: "dispatch", label: "Dispatch / admin" },
  { value: "business", label: "Business portal" },
  { value: "technician", label: "Technician-created" },
];

const PAYMENT_OPTIONS = [
  { value: "", label: "Any payment" },
  { value: "paid", label: "Paid" },
  { value: "unpaid", label: "Unpaid" },
];

function JobFilterDropdown({ open, onClose, onApply, onClear, initialFilters, anchorEl }) {
  const [status, setStatus] = useState("");
  const [technician, setTechnician] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [timeFrom, setTimeFrom] = useState("");
  const [timeTo, setTimeTo] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [jobType, setJobType] = useState("");
  const [source, setSource] = useState("");
  const [jobOrigin, setJobOrigin] = useState("");

  const { data: techniciansData } = useGetTechniciansQuery(
    { page: 1, limit: 200, search: "" },
    { skip: !open }
  );
  const { data: sourcesData } = useGetSourcesQuery(undefined, { skip: !open });

  useEffect(() => {
    if (!open) return;
    const f = initialFilters || EMPTY_JOB_FILTERS;
    setStatus(f.status || "");
    setTechnician(f.technician || "");
    setDateFrom(f.dateFrom || "");
    setDateTo(f.dateTo || "");
    setTimeFrom(f.timeFrom || "");
    setTimeTo(f.timeTo || "");
    setPaymentStatus(f.paymentStatus || "");
    setJobType(f.jobType || "");
    setSource(f.source || "");
    setJobOrigin(f.jobOrigin || "");
  }, [open, initialFilters]);

  const allTechnicians = techniciansData?.technicians || [];
  const statusOptions = getJobStatusFilterOptions();
  const technicianOptions = allTechnicians.map((tech) => ({
    value: `${tech.firstName} ${tech.lastName}`,
    label: `${tech.firstName} ${tech.lastName}`,
  }));

  const sourceOptions = (sourcesData?.sources || []).map((src) => ({
    value: src._id,
    label: src.mainSourceName || src.name || "Source",
  }));

  const jobTypeOptions = [
    { value: "", label: "Any job type" },
    ...JOB_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
  ];

  const handleApply = () => {
    onApply({
      status,
      technician,
      dateFrom,
      dateTo,
      timeFrom,
      timeTo,
      paymentStatus,
      jobType,
      source,
      jobOrigin,
    });
    onClose();
  };

  const handleClear = () => {
    setStatus("");
    setTechnician("");
    setDateFrom("");
    setDateTo("");
    setTimeFrom("");
    setTimeTo("");
    setPaymentStatus("");
    setJobType("");
    setSource("");
    setJobOrigin("");
    onClear?.();
    onClose();
  };

  if (!open) return null;

  return (
    <>
      <div className="filter-overlay" onClick={onClose} />
      <div className="filter-dropdown filter-dropdown--jobs" style={anchorEl ? undefined : {}}>
        <div className="filter-header">
          <span className="filter-title">Filter jobs</span>
        </div>
        <div className="filter-subtitle">Schedule, status, assignment, and billing</div>

        <div className="filter-scroll">
          <div className="filter-section-label">Schedule (Qatar)</div>
          <div className="filter-row filter-row--two">
            <div className="filter-field">
              <label className="filter-label">Date from</label>
              <input
                type="date"
                className="filter-native-input"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="filter-field">
              <label className="filter-label">Date to</label>
              <input
                type="date"
                className="filter-native-input"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>
          <div className="filter-row filter-row--two">
            <div className="filter-field">
              <label className="filter-label">Time from</label>
              <input
                type="time"
                className="filter-native-input"
                value={timeFrom}
                onChange={(e) => setTimeFrom(e.target.value)}
              />
            </div>
            <div className="filter-field">
              <label className="filter-label">Time to</label>
              <input
                type="time"
                className="filter-native-input"
                value={timeTo}
                onChange={(e) => setTimeTo(e.target.value)}
              />
            </div>
          </div>

          <div className="filter-section-label">Job details</div>
          <div className="filter-field">
            <label className="filter-label">Status</label>
            <CustomSelect
              value={status}
              onChange={setStatus}
              options={statusOptions}
              placeholder="Any status"
            />
          </div>
          <div className="filter-field">
            <label className="filter-label">Job type</label>
            <CustomSelect
              value={jobType}
              onChange={setJobType}
              options={jobTypeOptions}
              placeholder="Any job type"
              searchable
            />
          </div>
          <div className="filter-field">
            <label className="filter-label">Payment</label>
            <CustomSelect
              value={paymentStatus}
              onChange={setPaymentStatus}
              options={PAYMENT_OPTIONS}
              placeholder="Any payment"
            />
          </div>
          <div className="filter-field">
            <label className="filter-label">Origin</label>
            <CustomSelect
              value={jobOrigin}
              onChange={setJobOrigin}
              options={ORIGIN_OPTIONS}
              placeholder="Any origin"
            />
          </div>
          <div className="filter-field">
            <label className="filter-label">Source</label>
            <CustomSelect
              value={source}
              onChange={setSource}
              options={[{ value: "", label: "Any source" }, ...sourceOptions]}
              placeholder="Any source"
              searchable
            />
          </div>
          <div className="filter-field">
            <label className="filter-label">Technician</label>
            <CustomSelect
              value={technician}
              onChange={setTechnician}
              options={technicianOptions}
              placeholder="Any technician"
              searchable
            />
          </div>
        </div>

        <div className="filter-actions-row">
          <button type="button" className="filter-clear-btn" onClick={handleClear}>
            Clear
          </button>
          <button type="button" className="filter-apply-btn" onClick={handleApply}>
            Apply
          </button>
        </div>
      </div>
    </>
  );
}

export default JobFilterDropdown;
