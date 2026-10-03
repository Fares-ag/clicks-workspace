/**
 * Catalog of technician-app activity events.
 *
 * Single source of truth for: the writers (customer-tech API), the admin list
 * endpoint's filter options, and the labels the admin portal renders. Adding an
 * event here is what makes it selectable in the Technician Logs filters.
 */

const TECHNICIAN_ACTIVITY_CATEGORIES = {
  auth: "Authentication",
  account: "Account",
  session: "Availability",
  device: "Device",
  profile: "Profile",
  location: "Location",
  job: "Jobs",
};

/**
 * event -> { category, label, severity }
 * severity: info | warn | alert — drives the colour of the row badge.
 */
const TECHNICIAN_ACTIVITY_EVENTS = {
  // ── Authentication ──────────────────────────────────────────────────────
  "auth.login.success": { category: "auth", label: "Logged in", severity: "info" },
  "auth.login.failed": { category: "auth", label: "Login failed", severity: "alert" },
  "auth.logout": { category: "auth", label: "Logged out", severity: "info" },
  "auth.otp.sent": { category: "auth", label: "OTP sent", severity: "info" },
  "auth.otp.verified": { category: "auth", label: "OTP verified", severity: "info" },
  "auth.otp.failed": { category: "auth", label: "OTP failed", severity: "warn" },
  "auth.password.forgot_requested": {
    category: "auth",
    label: "Password reset requested",
    severity: "warn",
  },
  "auth.password.reset_otp_verified": {
    category: "auth",
    label: "Password reset OTP verified",
    severity: "info",
  },
  "auth.password.reset_otp_failed": {
    category: "auth",
    label: "Password reset OTP failed",
    severity: "warn",
  },
  "auth.password.reset": { category: "auth", label: "Password changed", severity: "warn" },

  // ── Account ─────────────────────────────────────────────────────────────
  "account.registered": { category: "account", label: "Registered", severity: "info" },
  "account.delete_requested": {
    category: "account",
    label: "Account deletion requested",
    severity: "alert",
  },
  "account.blocked": {
    category: "account",
    label: "Blocked (not approved / deactivated)",
    severity: "alert",
  },

  // ── Availability / presence ─────────────────────────────────────────────
  "session.online": { category: "session", label: "Went online", severity: "info" },
  "session.offline": { category: "session", label: "Went offline", severity: "info" },
  "session.offline_blocked": {
    category: "session",
    label: "Offline blocked (active job)",
    severity: "warn",
  },
  "session.app_opened": { category: "session", label: "App opened", severity: "info" },
  "session.app_closed": { category: "session", label: "App closed", severity: "info" },

  // ── Device ──────────────────────────────────────────────────────────────
  "device.push_token_registered": {
    category: "device",
    label: "Push token registered",
    severity: "info",
  },
  "device.push_token_cleared": {
    category: "device",
    label: "Push token cleared",
    severity: "info",
  },

  // ── Profile ─────────────────────────────────────────────────────────────
  "profile.updated": { category: "profile", label: "Profile updated", severity: "info" },
  "profile.home_hero_updated": {
    category: "profile",
    label: "Home image updated",
    severity: "info",
  },

  // ── Location ────────────────────────────────────────────────────────────
  "location.updated": { category: "location", label: "Location ping", severity: "info" },

  // ── Jobs ────────────────────────────────────────────────────────────────
  "job.created": { category: "job", label: "Created job", severity: "info" },
  "job.accepted": { category: "job", label: "Accepted job", severity: "info" },
  "job.rejected": { category: "job", label: "Rejected job", severity: "warn" },
  "job.en_route": { category: "job", label: "Started en route", severity: "info" },
  "job.arrived": { category: "job", label: "Arrived", severity: "info" },
  "job.started": { category: "job", label: "Started job", severity: "info" },
  "job.start_blocked": {
    category: "job",
    label: "Start blocked (too far / status)",
    severity: "warn",
  },
  "job.status_changed": { category: "job", label: "Changed job status", severity: "info" },
  "job.details_updated": { category: "job", label: "Edited job details", severity: "info" },
  "job.repair_added": { category: "job", label: "Added repair", severity: "info" },
  "job.signature_captured": {
    category: "job",
    label: "Captured customer signature",
    severity: "info",
  },
  "job.payment_collected": { category: "job", label: "Collected payment", severity: "info" },
  "job.completed": { category: "job", label: "Completed job", severity: "info" },
  "job.complete_blocked": {
    category: "job",
    label: "Complete blocked (gate failed)",
    severity: "warn",
  },
  "job.cancelled": { category: "job", label: "Cancelled job", severity: "warn" },
  "job.hold_requested": { category: "job", label: "Requested hold", severity: "warn" },
  "job.hold_request_cancelled": {
    category: "job",
    label: "Cancelled hold request",
    severity: "info",
  },
};

/** Label for the admin table; unknown events fall back to the raw key. */
function technicianActivityLabel(event) {
  return TECHNICIAN_ACTIVITY_EVENTS[event]?.label || event || "";
}

function technicianActivityCategory(event) {
  return TECHNICIAN_ACTIVITY_EVENTS[event]?.category || "other";
}

function technicianActivitySeverity(event) {
  return TECHNICIAN_ACTIVITY_EVENTS[event]?.severity || "info";
}

/** [{ value, label, category }] for the admin filter dropdown. */
function technicianActivityEventOptions() {
  return Object.entries(TECHNICIAN_ACTIVITY_EVENTS).map(([value, meta]) => ({
    value,
    label: meta.label,
    category: meta.category,
    severity: meta.severity,
  }));
}

module.exports = {
  TECHNICIAN_ACTIVITY_CATEGORIES,
  TECHNICIAN_ACTIVITY_EVENTS,
  technicianActivityLabel,
  technicianActivityCategory,
  technicianActivitySeverity,
  technicianActivityEventOptions,
};
