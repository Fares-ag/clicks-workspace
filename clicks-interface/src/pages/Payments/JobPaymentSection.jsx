import React, { useState } from "react";
import { useMarkJobPaidMutation } from "../../store/jobApi";
import { useGetRefundsQuery } from "../../store/paymentsApi";
import RefundDetailModal from "./RefundDetailModal.jsx";
import {
  RequestRefundModal,
  RefundStatusBadge,
  errorText,
  formatDateTime,
  formatMoney,
} from "./paymentUi.jsx";
import "../../components/ConfirmationModal.css";
import "./Payments.css";

const METHODS = [
  ["waived", "Waive the balance (no payment)"],
  ["cash", "Cash"],
  ["card", "Card (outside SkipCash)"],
  ["wallet", "Wallet"],
  ["fawran", "Fawran"],
];

function MarkPaidModal({ jobId, onClose, onDone }) {
  const [markPaid] = useMarkJobPaidMutation();
  const [method, setMethod] = useState("waived");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const waive = method === "waived";

  const submit = async () => {
    const ref = reference.trim();
    const why = reason.trim();
    if (waive && !why) return setError("A reason is required to waive a balance");
    if (!waive && !ref) return setError("Enter the payment reference");
    setBusy(true);
    setError("");
    try {
      await markPaid({
        id: jobId,
        payment_method: method,
        reference: ref || undefined,
        reason: why || undefined,
      }).unwrap();
      onDone(waive ? "Balance waived" : "Job marked paid");
    } catch (err) {
      setError(errorText(err, "Mark paid failed"));
      setBusy(false);
    }
    return undefined;
  };

  return (
    <div className="confirmation-modal-backdrop" role="presentation">
      <div className="confirmation-modal pay-modal" role="dialog" aria-modal="true">
        <button className="confirmation-modal-close" onClick={onClose} disabled={busy} aria-label="Close">
          <span className="confirmation-modal-close-x">&#10005;</span>
        </button>
        <div className="pay-modal-body">
          <div className="confirmation-modal-title">Mark paid / waive</div>
          <p className="pay-modal-intro">
            Records the job as paid outside the app, issues the receipt and releases the unpaid
            hold. Audited with your name.
          </p>
          <label className="pay-field">
            <span className="pay-field-label">How was it settled?</span>
            <select value={method} disabled={busy} onChange={(e) => { setMethod(e.target.value); setError(""); }}>
              {METHODS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          {!waive && (
            <label className="pay-field">
              <span className="pay-field-label">Payment reference</span>
              <input
                type="text"
                maxLength={200}
                value={reference}
                disabled={busy}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Receipt / transfer / terminal reference"
              />
            </label>
          )}
          <label className="pay-field">
            <span className="pay-field-label">
              {waive ? "Reason for waiving" : "Note"}
              {!waive && <span className="pay-optional"> (optional)</span>}
            </span>
            <textarea rows={3} maxLength={1000} value={reason} disabled={busy} onChange={(e) => setReason(e.target.value)} />
          </label>
          {error && <p className="pay-error">{error}</p>}
          <div className="confirmation-modal-actions">
            <button className="confirmation-modal-cancel" onClick={onClose} disabled={busy}>Go Back</button>
            <button className="confirmation-modal-confirm" onClick={submit} disabled={busy} style={{ opacity: busy ? 0.6 : 1 }}>
              {busy ? "Saving..." : waive ? "Waive balance" : "Mark paid"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const DECISION_LABEL = {
  full: "Full refund",
  partial: "Partial refund",
  none: "No refund",
};

/**
 * Job detail "Payment & refunds" (full admins only — every endpoint here is
 * full-admin): audited mark paid / waive, refund request on paid jobs, the
 * cancel-time refund decision and this job's refund cases.
 */
function JobPaymentSection({ job, onChanged }) {
  const [modal, setModal] = useState(null);
  const [openRefundId, setOpenRefundId] = useState(null);
  const { data } = useGetRefundsQuery({ jobId: job._id, limit: 50 });
  const refunds = data?.refunds || [];
  const paymentStatus = job.payment_status || "unpaid";
  const paid = paymentStatus === "paid" || paymentStatus === "partially_refunded";
  const canMarkPaid = paymentStatus === "unpaid" && job.job_status !== "cancelled";
  const decision = job.cancellation_refund;

  const done = (message) => {
    setModal(null);
    if (message) alert(message);
    onChanged?.();
  };

  return (
    <div className="job-details-section-full pay-job-section">
      <h3 className="job-details-section-title">Payment &amp; refunds</h3>
      <p className="pay-modal-intro">
        Payment: <strong>{paymentStatus}</strong>
        {job.payment_method ? ` via ${job.payment_method}` : ""}
        {job.refunded_amount > 0 ? ` · refunded ${formatMoney(job.refunded_amount)}` : ""}
      </p>
      {decision?.decision && (
        <div className="pay-modal-intro">
          Cancelled with: {DECISION_LABEL[decision.decision] || decision.decision}
          {decision.decision === "partial" ? ` of ${formatMoney(decision.amount)}` : ""}
          {decision.reason ? ` — ${decision.reason}` : ""}
          {decision.request_error && (
            <p className="pay-error">
              The refund case could not be opened automatically: {decision.request_error}. Request it manually below.
            </p>
          )}
        </div>
      )}
      {refunds.length > 0 && (
        <ul className="pay-job-refunds">
          {refunds.map((r) => (
            <li key={r._id} onClick={() => setOpenRefundId(r._id)}>
              <span>
                <strong>{formatMoney(r.amount)}</strong> · {r.reason}
                <span className="pay-sub"> · {formatDateTime(r.createdAt)}</span>
              </span>
              <RefundStatusBadge status={r.status} />
            </li>
          ))}
        </ul>
      )}
      <div className="pay-actions">
        {canMarkPaid && (
          <button type="button" className="btn-secondary" onClick={() => setModal("markPaid")}>
            Mark paid / waive
          </button>
        )}
        {paid && (
          <button type="button" className="btn-secondary" onClick={() => setModal("refund")}>
            Request refund
          </button>
        )}
      </div>
      {modal === "markPaid" && (
        <MarkPaidModal jobId={job._id} onClose={() => setModal(null)} onDone={done} />
      )}
      {modal === "refund" && (
        <RequestRefundModal
          jobId={job._id}
          label={[job.job_reference, job.clientName].filter(Boolean).join(" · ")}
          onClose={() => setModal(null)}
          onDone={(refund) =>
            done(`Refund of ${formatMoney(refund?.amount)} requested — awaiting approval by another Super Admin`)
          }
        />
      )}
      {openRefundId && (
        <RefundDetailModal
          refundId={openRefundId}
          onClose={() => {
            setOpenRefundId(null);
            onChanged?.();
          }}
        />
      )}
    </div>
  );
}

export default JobPaymentSection;
