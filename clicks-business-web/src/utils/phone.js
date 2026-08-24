/** Qatar-first phone helpers — same rules as Flutter business app / admin Add Job. */
import {
  getJobStatusThemeClass,
  titleCaseStatus,
} from "./jobStatusLabels";

export const DEFAULT_COUNTRY_CODE = "+974";

export const COUNTRY_CODES = [
  { value: "+974", label: "+974" },
  { value: "+971", label: "+971" },
  { value: "+966", label: "+966" },
  { value: "+973", label: "+973" },
  { value: "+968", label: "+968" },
  { value: "+965", label: "+965" },
];

export function toLocalDigits(raw, countryCode = DEFAULT_COUNTRY_CODE) {
  let digits = String(raw || "").replace(/\D/g, "");
  const cc = String(countryCode || "").replace(/\D/g, "");
  if (cc && digits.startsWith(cc) && digits.length > cc.length) {
    digits = digits.slice(cc.length);
  }
  if (digits.length > 8 && digits.startsWith("974")) {
    digits = digits.slice(3);
  }
  if (digits.length > 8) digits = digits.slice(0, 8);
  return digits;
}

export function isValidLocalPhone(localDigits) {
  return /^\d{8}$/.test(localDigits);
}

export function formatMoney(value) {
  const n = Number(value) || 0;
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** @deprecated Use getJobStatusLabel — kept for payment_status and other non-job fields. */
export function statusLabel(status) {
  return titleCaseStatus(status);
}

/** @deprecated Use getJobStatusThemeClass for job_status pills. */
export function statusClass(status) {
  return getJobStatusThemeClass(status);
}

export {
  getJobStatusLabel as jobStatusLabel,
  getJobStatusThemeClass as jobStatusClass,
} from "./jobStatusLabels";
