import React, { useEffect, useState } from "react";
import PrimaryButton from "../../components/PrimaryButton.jsx";
import { useGetSettlementJobCandidatesQuery } from "../../store/portalApi";
import { PAYMENT_METHOD_OPTIONS, formatMoney, formatPeriod } from "./settlementMath";

const PICKER_LIMIT = 100;

const METHOD_LABELS = Object.fromEntries(
  PAYMENT_METHOD_OPTIONS.map((option) => [option.value, option.label])
);

function formatCompleted(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Qatar",
  });
}

/**
 * Pick individual jobs from the system for a settlement: the technician's
 * completed jobs, searchable by job ID, client or phone, within the period by
 * default. Jobs already in this or another settlement are listed but cannot be
 * picked.
 */
function JobPicker({ settlementId, periodFrom, periodTo, addedJobIds, onAdd, onAddByHand, onClose }) {
  const [searchInput, setSearchInput] = useState("");
  const [term, setTerm] = useState("");
  const [periodOnly, setPeriodOnly] = useState(true);
  const [selected, setSelected] = useState(() => new Map());

  useEffect(() => {
    const timer = setTimeout(() => setTerm(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // currentData, not data: a new search must not show the previous result's rows.
  const { currentData, isFetching, isError } = useGetSettlementJobCandidatesQuery({
    id: settlementId,
    from: periodFrom,
    to: periodTo,
    any_date: !periodOnly,
    search: term,
    limit: PICKER_LIMIT,
  });
  const jobs = currentData?.jobs || [];

  const toggle = (job) => {
    setSelected((current) => {
      const next = new Map(current);
      const key = String(job.job_id);
      if (next.has(key)) next.delete(key);
      else next.set(key, job);
      return next;
    });
  };

  return (
    <div className="settlement-modal-backdrop" onClick={onClose}>
      <div
        className="settlement-modal settlement-modal--wide"
        role="dialog"
        aria-labelledby="job-picker-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="job-picker-title" className="settlement-modal-title">
          Select jobs from the system
        </h2>
        <div className="job-picker-controls">
          <input
            type="search"
            placeholder="Search job ID, client or phone"
            aria-label="Search jobs"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            autoFocus
          />
          <label className="job-picker-toggle">
            <input
              type="checkbox"
              checked={periodOnly}
              onChange={(e) => setPeriodOnly(e.target.checked)}
            />
            Only completed {formatPeriod(periodFrom, periodTo)}
          </label>
        </div>

        <div className="job-picker-list">
          {isError && <p className="job-picker-empty">Could not load the technician's jobs.</p>}
          {!isError && !currentData && (
            <p className="job-picker-empty">{isFetching ? "Loading jobs…" : ""}</p>
          )}
          {currentData && jobs.length === 0 && (
            <p className="job-picker-empty">
              No completed jobs for this technician match
              {periodOnly ? " in this period" : ""}.
            </p>
          )}
          {jobs.map((job) => {
            const key = String(job.job_id);
            const alreadyAdded = addedJobIds.has(key);
            const blocked = alreadyAdded || Boolean(job.settlement);
            return (
              <label key={key} className={`job-picker-row${blocked ? " blocked" : ""}`}>
                <input
                  type="checkbox"
                  checked={alreadyAdded || selected.has(key)}
                  disabled={blocked}
                  onChange={() => toggle(job)}
                />
                <span className="job-picker-main">
                  <strong>{job.label}</strong>
                  <span>
                    {[job.client_name, job.client_phone].filter(Boolean).join(" · ") || "—"}
                  </span>
                </span>
                <span className="job-picker-meta">
                  <span>{formatCompleted(job.completed_at)}</span>
                  <span className="job-picker-method">
                    {METHOD_LABELS[job.payment_method] || job.payment_method}
                  </span>
                </span>
                <span className="job-picker-amount">
                  {alreadyAdded
                    ? "Already added"
                    : job.settlement
                      ? `In settlement #${job.settlement.number}`
                      : `QAR ${formatMoney(job.amount)}`}
                </span>
              </label>
            );
          })}
          {currentData?.truncated && (
            <p className="job-picker-empty">
              Showing the first {PICKER_LIMIT} jobs. Search to narrow them down.
            </p>
          )}
        </div>

        <div className="job-picker-footer">
          <button type="button" className="settlement-link-btn" onClick={onAddByHand}>
            Job not in the system? Add it by hand
          </button>
          <div className="settlement-modal-actions">
            <button type="button" className="settlement-secondary-btn" onClick={onClose}>
              Cancel
            </button>
            <PrimaryButton
              onClick={() => onAdd([...selected.values()])}
              disabled={selected.size === 0}
            >
              {selected.size === 0
                ? "Add jobs"
                : `Add ${selected.size} job${selected.size === 1 ? "" : "s"}`}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}

export default JobPicker;
