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

/** Configured late-cancel fee in QAR, or null when none is set. */
function configuredCancelFeeQar() {
  const raw = process.env.CUSTOMER_CANCEL_FEE_QAR;
  if (raw == null || String(raw).trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/**
 * What the app shows next to "Cancel" (scenario 63): derived from the same
 * decision the cancel endpoint enforces, so the screen can never threaten a
 * fee the server would not record (or hide one it would).
 *
 *   kind: "free" | "fee" | "contact_support" | "none"
 *   fee_amount: QAR when kind is "fee" and an amount is configured, else null
 */
function customerCancelPolicy(job) {
  const status = String(job?.job_status || "").trim();
  if (!status) return { kind: "none", allowed: false, code: "NO_JOB", fee_amount: null };
  const decision = customerCancelDecision(status);
  let kind = "none";
  if (decision.allowed && !decision.fee) kind = "free";
  else if (decision.allowed && decision.fee) kind = "fee";
  else if (decision.code === "JOB_ON_HOLD_CONTACT_SUPPORT") kind = "contact_support";
  return {
    job_id: job?._id ? String(job._id) : null,
    job_status: status,
    kind,
    allowed: decision.allowed,
    code: decision.code,
    fee_amount: kind === "fee" ? configuredCancelFeeQar() : null,
    currency: "QAR",
  };
}

module.exports = {
  customerCancelDecision,
  customerCancelRefusalMessage,
  customerCancelPolicy,
  CUSTOMER_CANCELLABLE_STATUSES,
};
