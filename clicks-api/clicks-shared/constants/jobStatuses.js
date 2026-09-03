/**
 * Canonical job_status lists for Jobs.
 * Keep in sync with clicks-shared/models/Job.js enum.
 */

const JOB_STATUSES = [
  "pending",
  "assigned",
  "accepted",
  "en_route",
  "arrived",
  "in_progress",
  "on_hold",
  "completed",
  "cancelled",
];

/** Statuses that keep a technician "On Job" (multi-job occupancy). */
const TECH_BUSY_JOB_STATUSES = [
  "accepted",
  "en_route",
  "arrived",
  "in_progress",
];

/**
 * Jobs that appear in the technician session queue (including held jobs
 * so they can be resumed). Unpaid completed is ORed separately.
 */
const TECH_SESSION_ACTIVE_STATUSES = [
  "assigned",
  "accepted",
  "en_route",
  "arrived",
  "in_progress",
  "on_hold",
];

/** Statuses admin may put on hold (technicians see read-only on_hold status). */
const HOLDABLE_JOB_STATUSES = [
  "accepted",
  "en_route",
  "arrived",
  "in_progress",
];

/**
 * Going Offline is blocked for these live statuses.
 * on_hold is excluded so a technician can go Offline with only held jobs.
 */
const OFFLINE_BLOCKING_STATUSES = [
  "assigned",
  "accepted",
  "en_route",
  "arrived",
  "in_progress",
];

/** Admin / dashboard "ongoing dispatch" — excludes on_hold. */
const ONGOING_JOB_STATUSES = [
  "assigned",
  "accepted",
  "en_route",
  "arrived",
  "in_progress",
];

/** Lower number = higher priority in technician session sort. */
const JOB_STATUS_PRIORITY = {
  in_progress: 0,
  arrived: 1,
  en_route: 2,
  accepted: 3,
  assigned: 4,
  on_hold: 5,
  completed: 6,
};

module.exports = {
  JOB_STATUSES,
  TECH_BUSY_JOB_STATUSES,
  TECH_SESSION_ACTIVE_STATUSES,
  HOLDABLE_JOB_STATUSES,
  OFFLINE_BLOCKING_STATUSES,
  ONGOING_JOB_STATUSES,
  JOB_STATUS_PRIORITY,
};
