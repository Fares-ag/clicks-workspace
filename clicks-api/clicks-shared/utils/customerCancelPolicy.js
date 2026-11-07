/**
 * Customer-initiated job cancel rules.
 * Fee is a flag only — collection is a later product decision.
 *
 * pending  — no technician has touched it yet, so it is free (scenario 57).
 * on_hold  — dispatch is holding the job (parts, garage); the customer must
 *            talk to support rather than being told "work has started".
 */

const FREE = new Set(["pending", "assigned", "accepted"]);
const FEE = new Set(["en_route", "arrived"]);
const CONTACT_SUPPORT = new Set(["on_hold"]);

/** Every status the customer path may move to cancelled. */
const CUSTOMER_CANCELLABLE_STATUSES = [...FREE, ...FEE];

function customerCancelDecision(status) {
  const jobStatus = String(status || "").trim();
  if (FREE.has(jobStatus)) {
    return { allowed: true, fee: false, code: "CANCEL_FREE" };
  }
  if (FEE.has(jobStatus)) {
    return { allowed: true, fee: true, code: "CANCEL_FEE" };
  }
  if (CONTACT_SUPPORT.has(jobStatus)) {
    return { allowed: false, fee: false, code: "JOB_ON_HOLD_CONTACT_SUPPORT" };
  }
  return { allowed: false, fee: false, code: "JOB_NOT_CANCELLABLE" };
}

/** Customer-facing copy for a refused cancel. */
function customerCancelRefusalMessage(code) {
  if (code === "JOB_ON_HOLD_CONTACT_SUPPORT") {
    return "This job is on hold with our team — please contact support to cancel it";
  }
  return "Work has already started — please contact support";
}

module.exports = {
  customerCancelDecision,
  customerCancelRefusalMessage,
  CUSTOMER_CANCELLABLE_STATUSES,
};
