import React from "react";
import { getJobStatusLabel } from "../utils/jobStatusLabels";

function TrendLine({ pct }) {
  if (pct == null || Number.isNaN(Number(pct))) return null;
  const n = Number(pct);
  return (
    <span className={`jobs-stat-trend ${n >= 0 ? "up" : "down"}`}>
      {n >= 0 ? "+" : ""}
      {n}% vs yesterday
    </span>
  );
}

function formatUpdatedAt(ms) {
  if (!ms) return null;
  return new Date(ms).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function StatChip({
  label,
  hint,
  value,
  trend,
  active,
  onClick,
  variant,
  loading,
}) {
  if (loading) {
    return (
      <div className="jobs-stat-chip jobs-stat-chip--loading" aria-hidden="true">
        <span className="jobs-stat-chip-label">&nbsp;</span>
        <span className="jobs-stat-chip-value">&nbsp;</span>
      </div>
    );
  }

  const variantClass = variant ? `jobs-stat-chip--${variant}` : "";
  const activeClass = active ? "jobs-stat-chip--active" : "";

  return (
    <button
      type="button"
      className={`jobs-stat-chip ${variantClass} ${activeClass}`.trim()}
      onClick={onClick}
      aria-pressed={active}
      title={hint}
    >
      <span className="jobs-stat-chip-label">{label}</span>
      <span className="jobs-stat-chip-value">{value}</span>
      {hint ? <span className="jobs-stat-chip-hint">{hint}</span> : null}
      {trend != null ? <TrendLine pct={trend} /> : null}
    </button>
  );
}

/**
 * @param {object} props
 * @param {object|null} props.summary — dashboard summary payload
 * @param {boolean} props.loading
 * @param {boolean} [props.refreshing]
 * @param {string|null} props.activeFilter
 * @param {(filter: string|null) => void} props.onFilterChange
 * @param {boolean} props.showRevenue
 * @param {number} [props.updatedAt]
 * @param {boolean} [props.filterActive]
 * @param {() => void} [props.onRefresh]
 * @param {() => void} [props.onReset]
 */
function JobStatsStrip({
  summary,
  loading,
  refreshing = false,
  activeFilter,
  onFilterChange,
  showRevenue,
  updatedAt,
  filterActive = false,
  onRefresh,
  onReset,
}) {
  const jobs = summary?.jobs ?? {};
  const earnings = summary?.earnings ?? {};
  const trends = summary?.trends ?? {};
  const scopedByDate = Boolean(summary?.scopedByDate);
  const scopedByFilters = Boolean(summary?.scopedByFilters);

  const toggle = (key) => {
    onFilterChange(activeFilter === key ? null : key);
  };

  const n = (value) => Number(value) || 0;
  const fmt = (value) => n(value).toLocaleString();

  const revenueToday = Number(earnings.today) || 0;
  const createdOrScheduled = n(jobs.createdToday ?? jobs.total);
  const cancelledToday = n(jobs.cancelledToday ?? jobs.cancelled);

  return (
    <section className="jobs-stats-panel" aria-label="Job statistics">
      <div className="jobs-stats-panel-header">
        <div>
          <h2 className="jobs-stats-panel-title">
            {scopedByDate ? "Filtered snapshot" : "Today\u2019s snapshot"}
          </h2>
          <p className="jobs-stats-panel-subtitle">
            {scopedByDate
              ? "Today cards follow the selected dates. Live cards are open jobs in that range. Tap a card to list the same jobs."
              : scopedByFilters
                ? "Counts match your search and filters. Tap a card to list the same jobs."
                : "Today cards use Qatar time. Live cards are open jobs right now. Tap a card to list the same jobs."}
            {updatedAt ? (
              <span className="jobs-stats-updated">
                {" "}
                Updated {formatUpdatedAt(updatedAt)}
                {refreshing ? " · refreshing…" : ""}
              </span>
            ) : null}
          </p>
        </div>
        <div className="jobs-stats-panel-actions">
          {filterActive ? (
            <button
              type="button"
              className="jobs-stats-action jobs-stats-action--ghost"
              onClick={onReset}
            >
              Clear filters
            </button>
          ) : null}
          <button
            type="button"
            className="jobs-stats-action"
            onClick={onRefresh}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing…" : "Refresh stats"}
          </button>
        </div>
      </div>

      <div className="jobs-stats-section">
        <h3 className="jobs-stats-section-title">
          {scopedByDate ? "In selected dates" : "Today (Qatar)"}
        </h3>
        <div className="jobs-stats-grid" role="group" aria-label="Today job counts">
          <StatChip
            label={scopedByDate ? "Scheduled" : "Created today"}
            hint={
              scopedByDate
                ? "Jobs created in the selected dates"
                : "Opened today by created time (Qatar)"
            }
            value={fmt(createdOrScheduled)}
            active={activeFilter === "createdToday"}
            onClick={() => toggle("createdToday")}
            loading={loading}
          />
          <StatChip
            label={scopedByDate ? "Completed" : "Completed today"}
            hint={
              scopedByDate
                ? "Jobs completed in the selected dates (completion time)"
                : "Finished today by completion time (Qatar)"
            }
            value={fmt(jobs.completedToday)}
            trend={scopedByDate ? null : trends.completedJobsPct}
            active={activeFilter === "completedToday"}
            onClick={() => toggle("completedToday")}
            loading={loading}
          />
          <StatChip
            label={scopedByDate ? "Cancelled" : "Cancelled today"}
            hint={
              scopedByDate
                ? "Jobs cancelled in the selected dates (cancel time)"
                : "Cancelled today by cancel time (Qatar)"
            }
            value={fmt(cancelledToday)}
            active={activeFilter === "cancelledToday"}
            onClick={() => toggle("cancelledToday")}
            loading={loading}
          />
          <StatChip
            label="Unpaid"
            hint="Open or completed jobs still unpaid (not cancelled)"
            value={fmt(jobs.unpaid)}
            active={activeFilter === "unpaid"}
            onClick={() => toggle("unpaid")}
            variant={n(jobs.unpaid) > 0 ? "warn" : undefined}
            loading={loading}
          />
          {showRevenue ? (
            <StatChip
              label={scopedByDate ? "Revenue" : "Revenue today"}
              hint={
                scopedByDate
                  ? "From jobs completed in the selected dates"
                  : "From jobs completed today (completion time)"
              }
              value={`QR ${revenueToday.toLocaleString()}`}
              trend={scopedByDate ? null : trends.earningsPct}
              active={activeFilter === "revenueToday"}
              onClick={() => toggle("revenueToday")}
              variant="revenue"
              loading={loading}
            />
          ) : null}
        </div>
      </div>

      <div className="jobs-stats-section">
        <h3 className="jobs-stats-section-title">Live pipeline</h3>
        <div className="jobs-stats-grid" role="group" aria-label="Live job counts">
          <StatChip
            label="Open"
            hint="Pending through on hold — not completed or cancelled"
            value={fmt(jobs.open)}
            active={activeFilter === "open"}
            onClick={() => toggle("open")}
            loading={loading}
          />
          <StatChip
            label="Pending"
            hint="Awaiting technician assignment"
            value={fmt(jobs.pending)}
            active={activeFilter === "pending"}
            onClick={() => toggle("pending")}
            variant={n(jobs.pending) > 0 ? "warn" : undefined}
            loading={loading}
          />
          <StatChip
            label={getJobStatusLabel("assigned")}
            hint="Assigned, not yet accepted"
            value={fmt(jobs.assigned)}
            active={activeFilter === "assigned"}
            onClick={() => toggle("assigned")}
            loading={loading}
          />
          <StatChip
            label={getJobStatusLabel("accepted")}
            hint="Accepted by technician (not returning from workshop)"
            value={fmt(jobs.accepted)}
            active={activeFilter === "accepted"}
            onClick={() => toggle("accepted")}
            loading={loading}
          />
          <StatChip
            label={getJobStatusLabel("en_route")}
            hint="Technician on the way"
            value={fmt(jobs.enRoute)}
            active={activeFilter === "en_route"}
            onClick={() => toggle("en_route")}
            variant="info"
            loading={loading}
          />
          <StatChip
            label={getJobStatusLabel("arrived")}
            hint="Technician on site"
            value={fmt(jobs.arrived)}
            active={activeFilter === "arrived"}
            onClick={() => toggle("arrived")}
            variant="info"
            loading={loading}
          />
          <StatChip
            label={getJobStatusLabel("in_progress")}
            hint="Work started"
            value={fmt(jobs.inProgress)}
            active={activeFilter === "in_progress"}
            onClick={() => toggle("in_progress")}
            variant="info"
            loading={loading}
          />
          <StatChip
            label="On hold"
            hint="Paused on site (excludes workshop)"
            value={fmt(jobs.onHold)}
            active={activeFilter === "on_hold"}
            onClick={() => toggle("on_hold")}
            variant={n(jobs.onHold) > 0 ? "warn" : undefined}
            loading={loading}
          />
          <StatChip
            label="At garage"
            hint="Vehicle at workshop"
            value={fmt(jobs.atGarage)}
            active={activeFilter === "at_garage"}
            onClick={() => toggle("at_garage")}
            variant={n(jobs.atGarage) > 0 ? "accent" : undefined}
            loading={loading}
          />
          <StatChip
            label="Returning"
            hint="Ready for drop-off"
            value={fmt(jobs.returning)}
            active={activeFilter === "returning"}
            onClick={() => toggle("returning")}
            variant={n(jobs.returning) > 0 ? "accent" : undefined}
            loading={loading}
          />
        </div>
      </div>
    </section>
  );
}

export default JobStatsStrip;
