import React from "react";

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

  const completedToday = jobs.completedToday ?? 0;
  const pending = jobs.pending ?? 0;
  const ongoing = jobs.ongoing ?? 0;
  const onHold = jobs.onHold ?? 0;
  const atGarage = jobs.atGarage ?? 0;
  const returning = jobs.returning ?? 0;
  const cancelled = jobs.cancelled ?? 0;
  const revenueToday = Number(earnings.today) || 0;

  const garageHint =
    returning > 0
      ? `${returning} returning for drop-off`
      : "Vehicle at workshop";

  return (
    <section className="jobs-stats-panel" aria-label="Job statistics">
      <div className="jobs-stats-panel-header">
        <div>
          <h2 className="jobs-stats-panel-title">
            {scopedByDate ? "Filtered snapshot" : "Today\u2019s snapshot"}
          </h2>
          <p className="jobs-stats-panel-subtitle">
            {scopedByDate
              ? "Counts for selected dates (by scheduled job date). Tap a card to filter the list."
              : scopedByFilters
                ? "Counts match your filters. Tap a card to filter the list."
                : "Tap a card to filter the job list below."}
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

      <div className="jobs-stats-grid" role="group" aria-label="Job KPI cards">
        <StatChip
          label={scopedByDate ? "Completed" : "Completed today"}
          hint={
            scopedByDate
              ? "Completed jobs in the selected date range"
              : "Finished today (Qatar time)"
          }
          value={completedToday.toLocaleString()}
          trend={scopedByDate ? null : trends.completedJobsPct}
          active={activeFilter === "completedToday"}
          onClick={() => toggle("completedToday")}
          loading={loading}
        />
        <StatChip
          label="Pending"
          hint="Awaiting technician assignment"
          value={pending.toLocaleString()}
          active={activeFilter === "pending"}
          onClick={() => toggle("pending")}
          variant={pending > 0 ? "warn" : undefined}
          loading={loading}
        />
        <StatChip
          label="Ongoing"
          hint="Assigned through in progress"
          value={ongoing.toLocaleString()}
          active={activeFilter === "ongoing"}
          onClick={() => toggle("ongoing")}
          loading={loading}
        />
        <StatChip
          label="On hold"
          hint="Paused on site (not at workshop)"
          value={onHold.toLocaleString()}
          active={activeFilter === "on_hold"}
          onClick={() => toggle("on_hold")}
          variant={onHold > 0 ? "warn" : undefined}
          loading={loading}
        />
        <StatChip
          label="At garage"
          hint={garageHint}
          value={atGarage.toLocaleString()}
          active={activeFilter === "at_garage"}
          onClick={() => toggle("at_garage")}
          variant={atGarage > 0 ? "accent" : undefined}
          loading={loading}
        />
        <StatChip
          label="Cancelled"
          hint={scopedByDate ? "Cancelled in the selected date range" : "All cancelled jobs"}
          value={cancelled.toLocaleString()}
          active={activeFilter === "cancelled"}
          onClick={() => toggle("cancelled")}
          loading={loading}
        />
        {showRevenue ? (
          <StatChip
            label={scopedByDate ? "Revenue" : "Revenue today"}
            hint={
              scopedByDate
                ? "From completed jobs in the selected date range"
                : "From jobs completed today"
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
    </section>
  );
}

export default JobStatsStrip;
