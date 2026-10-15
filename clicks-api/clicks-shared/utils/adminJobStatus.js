/**
 * Payload + fire-and-forget helper for admin job-status socket updates.
 * Used by technician REST controllers; the /admin namespace handler lives in
 * sosSocketService.notifyAdminJobStatus.
 */

function technicianIdFromJob(job, extras = {}) {
  const raw =
    extras.technician_id ||
    job.assignedTechnician?._id ||
    job.assignedTechnician;
  return raw ? String(raw) : undefined;
}

function buildAdminJobStatusPayload(job, extras = {}) {
  if (!job) return null;
  const jobId = job._id || job.job_id;
  const status = extras.status || job.job_status;
  if (!jobId || !status) return null;
  return {
    job_id: String(jobId),
    status,
    job_reference: job.job_reference || undefined,
    clientName: job.clientName || undefined,
    technician_id: technicianIdFromJob(job, extras),
    assigned_at: job.assigned_at || extras.assigned_at || undefined,
    accepted_at: job.accepted_at || extras.accepted_at || undefined,
    en_route_at: job.en_route_at || extras.en_route_at || undefined,
    arrived_at: job.arrived_at || extras.arrived_at || undefined,
    started_at: job.started_at || extras.started_at || undefined,
  };
}

function notifyAdminJobStatusFromReq(req, job, extras) {
  const notify = req?.app?.get?.("notifyAdminJobStatus");
  if (typeof notify !== "function") return false;
  const payload = buildAdminJobStatusPayload(job, extras);
  if (!payload) return false;
  notify(payload);
  return true;
}

module.exports = {
  buildAdminJobStatusPayload,
  notifyAdminJobStatusFromReq,
};
