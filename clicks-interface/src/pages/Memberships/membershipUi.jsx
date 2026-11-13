import React from "react";

export const MEMBERSHIP_STATUS = {
  active: { label: "Active", tone: "success" },
  pending_payment: { label: "Pending payment", tone: "pending" },
  expired: { label: "Expired", tone: "muted" },
  cancelled: { label: "Cancelled", tone: "danger" },
  paid_duplicate: { label: "Paid duplicate", tone: "warning" },
};

export const MEMBERSHIP_FILTERS = [
  { value: "active", label: "Active" },
  { value: "pending_payment", label: "Pending payment" },
  { value: "expired", label: "Expired" },
  { value: "cancelled", label: "Cancelled" },
  { value: "paid_duplicate", label: "Paid duplicate" },
  { value: "", label: "All" },
];

export function MembershipStatusBadge({ status }) {
  const s = MEMBERSHIP_STATUS[status] || { label: status || "—", tone: "muted" };
  return <span className={`pay-badge pay-badge--${s.tone}`}>{s.label}</span>;
}

export function customerLabel(row) {
  const c = row?.customer;
  if (!c) return "—";
  return c.name || c.phone || "—";
}

export function plateLabel(row) {
  return row?.vehicle?.plate || "—";
}

export function vehicleLabel(v) {
  if (!v) return "—";
  const parts = [v.plate, [v.make, v.model, v.year].filter(Boolean).join(" ")].filter(Boolean);
  return parts.join(" · ") || "Vehicle";
}

export function formatDate(raw) {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function usageBuckets(sub) {
  return (sub?.included || [])
    .map((inc) => String(inc.bucket || inc.serviceTypes?.[0] || "").trim())
    .filter(Boolean);
}

export function usedFor(sub, bucket) {
  const row = (sub?.usage || []).find((u) => u.bucket === bucket || u.serviceType === bucket);
  return Number(row?.used || 0);
}

export function apiError(err, fallback) {
  return err?.data?.message || err?.message || fallback;
}
