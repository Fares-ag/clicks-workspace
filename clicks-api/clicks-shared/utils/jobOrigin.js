function getSourceName(job) {
  if (!job) return "";
  return (
    job.source?.mainSourceName ||
    job.source?.name ||
    (typeof job.source === "string" ? job.source : "") ||
    ""
  );
}

function getTechnicianCreatorName(job) {
  if (!job) return "";
  const stamped = String(job.createdByTechnicianName || "").trim();
  if (stamped) return stamped;

  const creator = job.created_by_technician;
  if (creator && typeof creator === "object") {
    return `${creator.firstName || ""} ${creator.lastName || ""}`.trim();
  }

  if (isTechnicianCreatedJob(job) && job.assignedTechnician && typeof job.assignedTechnician === "object") {
    const tech = job.assignedTechnician;
    return `${tech.firstName || ""} ${tech.lastName || ""}`.trim();
  }

  return "";
}

function getJobSourceSubLabel(job) {
  if (!job) return "";
  if (isTechnicianCreatedJob(job)) {
    const techName = getTechnicianCreatorName(job);
    if (techName) return techName;
  }
  if (isBusinessPortalJob(job)) {
    const biz = String(job.businessName || "").trim();
    if (biz) return biz;
  }
  return String(job.subSource || "").trim();
}

function formatJobSourceLabel(job) {
  const main = getSourceName(job);
  if (!main) return "—";
  const sub = getJobSourceSubLabel(job);
  return sub ? `${main} — ${sub}` : main;
}

function isBusinessPortalJob(job) {
  if (!job) return false;
  if (job.business_id || job.businessName) return true;
  return /business\s*portal/i.test(String(getSourceName(job)));
}

function isTechnicianCreatedJob(job) {
  if (!job) return false;
  if (job.created_by_technician || job.createdByTechnicianName) return true;
  return /technician\s*app/i.test(String(getSourceName(job)));
}

function isSourceLockedJob(job) {
  return isBusinessPortalJob(job) || isTechnicianCreatedJob(job);
}

module.exports = {
  getSourceName,
  getTechnicianCreatorName,
  getJobSourceSubLabel,
  formatJobSourceLabel,
  isBusinessPortalJob,
  isTechnicianCreatedJob,
  isSourceLockedJob,
};
