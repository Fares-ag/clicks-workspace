/** Shared business-portal freshness probe for conditional polling (304). */
async function getBusinessFreshness(businessId) {
  const Job = require("../models/Job");
  const Lead = require("../models/Lead");

  const [latestJob, latestLead] = await Promise.all([
    Job.findOne({ business_id: businessId }).sort({ updatedAt: -1 }).select("updatedAt").lean(),
    Lead.findOne({ business_id: businessId }).sort({ updatedAt: -1 }).select("updatedAt").lean(),
  ]);

  const jobAt = latestJob?.updatedAt ? new Date(latestJob.updatedAt) : null;
  const leadAt = latestLead?.updatedAt ? new Date(latestLead.updatedAt) : null;
  // Newest row wins. Date.now() must NOT be in this max: it made as_of the
  // current instant on every request, so isNotModifiedSince could never be true
  // and the 304 short-circuit was dead code. Epoch (not now) when there are no
  // rows, so an empty tenant also stays cacheable.
  const asOf = new Date(Math.max(jobAt?.getTime() || 0, leadAt?.getTime() || 0));

  return { as_of: asOf.toISOString(), jobAt, leadAt };
}

function isNotModifiedSince(ifChangedSince, asOfIso) {
  if (!ifChangedSince) return false;
  const since = new Date(ifChangedSince);
  const asOf = new Date(asOfIso);
  if (Number.isNaN(since.getTime())) return false;
  return asOf.getTime() <= since.getTime();
}

module.exports = { getBusinessFreshness, isNotModifiedSince };
