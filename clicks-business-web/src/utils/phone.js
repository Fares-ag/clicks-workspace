/** Qatar-first phone helpers — same rules as Flutter business app / admin Add Job. */
export const DEFAULT_COUNTRY_CODE = "+974";

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

export function statusLabel(status) {
  return String(status || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function statusClass(status) {
  const s = String(status || "").toLowerCase();
  if (s === "completed") return "status-completed";
  if (s === "cancelled" || s === "rejected") return "status-rejected";
  if (s === "pending") return "status-pending";
  if (s === "accepted" || s === "assigned") return "status-accepted";
  if (s === "en_route") return "status-enroute";
  if (s === "arrived") return "status-arrived";
  if (s === "in_progress") return "status-in-progress";
  return "status-pending";
}
