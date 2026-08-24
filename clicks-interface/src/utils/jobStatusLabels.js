/**
 * KEEP IN SYNC — identical copies in clicks-interface, clicks-business-web, clicks-finance-web.
 * CI enforces parity via scripts/check-status-labels.mjs (line endings normalized).
 *
 * Single source of truth for job_status display labels and CSS class tokens.
 * Backend enum: pending, assigned, accepted, en_route, arrived, in_progress, completed, cancelled.
 * Legacy keys (paid, confirmed, on_hold) remain for historical admin rows.
 */

/** @type {Record<string, { label: string, cssClass: string }>} */
export const JOB_STATUS_LABELS = {
  pending: { label: "Pending", cssClass: "pending" },
  assigned: { label: "Assigned", cssClass: "assigned" },
  accepted: { label: "Accepted", cssClass: "accepted" },
  en_route: { label: "En route", cssClass: "en_route" },
  arrived: { label: "Arrived", cssClass: "arrived" },
  in_progress: { label: "In progress", cssClass: "in_progress" },
  completed: { label: "Completed", cssClass: "completed" },
  cancelled: { label: "Cancelled", cssClass: "cancelled" },
  paid: { label: "Paid", cssClass: "paid" },
  confirmed: { label: "Confirmed", cssClass: "confirmed" },
  on_hold: { label: "On hold", cssClass: "on_hold" },
};

/** Active lifecycle statuses (backend Job model enum). */
export const CANONICAL_JOB_STATUS_KEYS = [
  "pending",
  "assigned",
  "accepted",
  "en_route",
  "arrived",
  "in_progress",
  "completed",
  "cancelled",
];

/** Filter dropdown includes on_hold (admin legacy). */
export const JOB_STATUS_FILTER_KEYS = [...CANONICAL_JOB_STATUS_KEYS, "on_hold"];

function normalizeStatusKey(status) {
  return String(status || "").trim().toLowerCase();
}

export function titleCaseStatus(raw) {
  return String(raw || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getJobStatusLabel(status) {
  const key = normalizeStatusKey(status);
  return JOB_STATUS_LABELS[key]?.label ?? titleCaseStatus(status);
}

export function getJobStatusCssClass(status) {
  const key = normalizeStatusKey(status);
  if (JOB_STATUS_LABELS[key]) return JOB_STATUS_LABELS[key].cssClass;
  const fallback = key.replace(/[^a-z0-9_-]/g, "");
  return fallback || "pending";
}

/** Business portal theme.css — status-* prefixed pill classes. */
export function getJobStatusThemeClass(status) {
  const base = getJobStatusCssClass(status);
  if (base === "en_route") return "status-enroute";
  if (base === "in_progress") return "status-in-progress";
  if (base === "on_hold") return "status-on-hold";
  return `status-${base}`;
}

export function getJobStatusFilterOptions() {
  return JOB_STATUS_FILTER_KEYS.map((value) => ({
    value,
    label: JOB_STATUS_LABELS[value].label,
  }));
}

export function getJobStatusHeatmapOptions() {
  return [
    { value: "", label: "All statuses" },
    ...CANONICAL_JOB_STATUS_KEYS.map((value) => ({
      value,
      label: JOB_STATUS_LABELS[value].label,
    })),
  ];
}
