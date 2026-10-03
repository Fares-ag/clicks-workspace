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

function StatChip({
  label,
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
    >
      <span className="jobs-stat-chip-label">{label}</span>
      <span className="jobs-stat-chip-value">{value}</span>
      {trend != null ? <TrendLine pct={trend} /> : null}
    </button>
  );
}

/**
 * @param {object} props
 * @param {object|null} props.summary — dashboard summary payload
 * @param {boolean} props.loading
 * @param {string|null} props.activeFilter
 * @param {(filter: string|null) => void} props.onFilterChange
 * @param {boolean} props.showRevenue
 */
function JobStatsStrip({
  summary,
  loading,
  activeFilter,
  onFilterChange,
  showRevenue,
}) {
  const jobs = summary?.jobs ?? {};
  const earnings = summary?.earnings ?? {};
  const trends = summary?.trends ?? {};

  const toggle = (key) => {
    onFilterChange(activeFilter === key ? null : key);
  };

  const completedToday = jobs.completedToday ?? 0;
  const pending = jobs.pending ?? 0;
  const ongoing = jobs.ongoing ?? 0;
  const onHold = jobs.onHold ?? 0;
  const cancelled = jobs.cancelled ?? 0;
  const revenueToday = Number(earnings.today) || 0;

  return (
    <div className="jobs-stats-strip" role="group" aria-label="Job statistics">
      <StatChip
        label="Completed Today"
        value={completedToday}
        trend={trends.completedJobsPct}
        active={activeFilter === "completedToday"}
        onClick={() => toggle("completedToday")}
        loading={loading && !summary}
      />
      <StatChip
        label="Pending"
        value={pending}
        active={activeFilter === "pending"}
        onClick={() => toggle("pending")}
        variant={pending > 0 ? "warn" : undefined}
        loading={loading && !summary}
      />
      <StatChip
        label="Ongoing"
        value={ongoing}
        active={activeFilter === "ongoing"}
        onClick={() => toggle("ongoing")}
        loading={loading && !summary}
      />
      <StatChip
        label="On Hold"
        value={onHold}
        active={activeFilter === "on_hold"}
        onClick={() => toggle("on_hold")}
        variant={onHold > 0 ? "warn" : undefined}
        loading={loading && !summary}
      />
      <StatChip
        label="Cancelled"
        value={cancelled}
        active={activeFilter === "cancelled"}
        onClick={() => toggle("cancelled")}
        loading={loading && !summary}
      />
      {showRevenue ? (
        <StatChip
          label="Revenue Today"
          value={`QR ${revenueToday.toLocaleString()}`}
          trend={trends.earningsPct}
          active={activeFilter === "revenueToday"}
          onClick={() => toggle("revenueToday")}
          variant="revenue"
          loading={loading && !summary}
        />
      ) : null}
    </div>
  );
}

export default JobStatsStrip;
