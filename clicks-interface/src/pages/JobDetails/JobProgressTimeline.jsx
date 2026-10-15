import { Link } from "react-router-dom";
import { getJobStatusLabel } from "../../utils/jobStatusLabels";

const QATAR_TIME = {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Qatar",
};

const STEPS = [
  { key: "assigned", at: "assigned_at" },
  { key: "accepted", at: "accepted_at" },
  { key: "en_route", at: "en_route_at" },
  { key: "arrived", at: "arrived_at" },
  { key: "in_progress", at: "started_at" },
  { key: "completed", at: "completed_at" },
];

function formatQatarDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("en-US", QATAR_TIME);
}

function technicianId(job) {
  const assigned = job?.assignedTechnician;
  if (!assigned) return null;
  if (typeof assigned === "object") return assigned._id ? String(assigned._id) : null;
  return String(assigned);
}

function technicianMapsLink(job) {
  const coords = job?.assignedTechnician?.currentLocation?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

/**
 * Compact lifecycle strip so dispatch can see when a technician went en route
 * without opening logs. Reaches only as far as the job has actually gone.
 */
export default function JobProgressTimeline({ job }) {
  if (!job) return null;

  const status = job.job_status;
  const reached = STEPS.filter((step) => job[step.at] || step.key === status);
  if (reached.length === 0 || ["pending", "cancelled"].includes(status)) return null;

  const techId = technicianId(job);
  const lastFixLink = technicianMapsLink(job);
  const showEnRouteBanner = status === "en_route";

  return (
    <div className="job-details-progress">
      <ol className="job-details-progress-list">
        {reached.map((step, idx) => {
          const isCurrent = step.key === status;
          const time = formatQatarDateTime(job[step.at]);
          return (
            <li
              key={step.key}
              className={`job-details-progress-step${isCurrent ? " is-current" : " is-done"}`}
            >
              <span className="job-details-progress-dot" aria-hidden="true" />
              <span className="job-details-progress-label">{getJobStatusLabel(step.key)}</span>
              {time ? <span className="job-details-progress-time">{time}</span> : null}
              {idx < reached.length - 1 ? (
                <span className="job-details-progress-connector" aria-hidden="true" />
              ) : null}
            </li>
          );
        })}
      </ol>
      {showEnRouteBanner ? (
        <div className="job-details-enroute-banner">
          <div>
            <strong>Technician is en route</strong>
            {job.en_route_at ? (
              <span> since {formatQatarDateTime(job.en_route_at)}</span>
            ) : null}
          </div>
          <div className="job-details-enroute-actions">
            {techId ? (
              <Link to={`/live-map?tech=${encodeURIComponent(techId)}`}>
                View on live map
              </Link>
            ) : null}
            {lastFixLink ? (
              <a href={lastFixLink} target="_blank" rel="noopener noreferrer">
                Last GPS fix
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
