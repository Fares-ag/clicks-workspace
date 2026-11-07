/**
 * Customer-initiated job cancel rules.
 * Fee is a flag only — collection is a later product decision.
 */

const FREE = new Set(["assigned", "accepted"]);
const FEE = new Set(["en_route", "arrived"]);

function customerCancelDecision(status) {
  const jobStatus = String(status || "").trim();
  if (FREE.has(jobStatus)) {
    return { allowed: true, fee: false, code: "CANCEL_FREE" };
  }
  if (FEE.has(jobStatus)) {
    return { allowed: true, fee: true, code: "CANCEL_FEE" };
  }
  return { allowed: false, fee: false, code: "JOB_NOT_CANCELLABLE" };
}

module.exports = { customerCancelDecision };
