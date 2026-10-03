export function formatRelativeTime(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const diffSec = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  if (abs < 60) return rtf.format(diffSec, "second");
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
  if (abs < 604800) return rtf.format(Math.round(diffSec / 86400), "day");
  return date.toLocaleDateString();
}

export function notificationDeepLink(data = {}) {
  if (data.sos_id) return "/sos";
  if (data.service_request_id) return "/service-requests";
  if (data.lead_id) return `/leads/${data.lead_id}`;
  if (data.job_id) return `/jobs/${data.job_id}`;
  return null;
}

export function notificationTypeLabel(type) {
  switch (type) {
    case "sos.new":
      return "SOS";
    case "sos.claimed":
      return "SOS";
    case "sos.cancelled":
      return "SOS";
    case "sos.expired":
      return "SOS";
    case "service_request.new":
      return "Service";
    case "service_request.cancelled":
      return "Service";
    case "lead.new":
      return "Lead";
    case "job.business":
      return "Business";
    case "job.tech_created":
      return "Tech job";
    case "job.hold_request":
      return "Hold";
    default:
      return "Update";
  }
}
