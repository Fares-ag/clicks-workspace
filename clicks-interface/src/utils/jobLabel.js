/**
 * The app-wide job identity rule: a job is labelled by the Job ID the technician
 * typed in before completing it. Legacy jobs that never captured one fall back
 * to "#" + the last 6 characters of the _id.
 */
export function getJobDisplayId(job) {
  const reference = String(job?.job_reference || "").trim();
  if (reference) return reference;
  const rawId = String(job?._id || "");
  return rawId ? `#${rawId.slice(-6)}` : "N/A";
}
