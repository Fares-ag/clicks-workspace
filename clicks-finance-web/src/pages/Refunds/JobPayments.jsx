import React, { useState } from "react";
import PrimaryButton from "../../components/PrimaryButton.jsx";
import { useListRefundsQuery, useMarkJobPaidMutation } from "../../store/refundsApi";
import {
  RefundDetailModal,
  RefundStatusBadge,
  RequestRefundModal,
  errorText,
  formatDateTime,
  formatMoney,
} from "./refundUi.jsx";
import "./Refunds.css";

// Waiving a balance is an admin-console action; finance records real payments.
const METHODS = [
  ["card", "Card (outside SkipCash)"],
  ["wallet", "Wallet"],
  ["fawran", "Fawran"],
  ["cash", "Cash"],
];

function MarkPaidModal({ jobId, onClose, onDone }) {
  const [markPaid] = useMarkJobPaidMutation();
  const [method, setMethod] = useState("card");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const ref = reference.trim();
    if (!ref) return setError("A payment reference is required");
    setBusy(true);
    setError("");
    try {
      await markPaid({ id: jobId, payment_method: method, reference: ref, reason: note.trim() || undefined }).unwrap();
      onDone();
    } catch (err) {
      setError(errorText(err, "Mark paid failed"));
      setBusy(false);
    }
    return undefined;
  };

  return (
    <div className="job-detail-modal-backdrop" role="presentation">
      <div className="job-detail-modal" role="dialog" aria-modal="true">
        <h2 className="job-detail-modal-title">Mark paid</h2>
        <p className="job-detail-modal-copy">
          For a card / wallet / Fawran / cash payment confirmed outside SkipCash. Issues the
          receipt and is recorded in the audit log with the reference.
        </p>
        <label className="refund-field">
          <span className="job-detail-notes-label">Paid by</span>
          <select value={method} disabled={busy} onChange={(e) => setMethod(e.target.value)}>
            {METHODS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="refund-field">
          <span className="job-detail-notes-label">Payment reference</span>
          <input
            className="refund-input"
            maxLength={200}
            value={reference}
            disabled={busy}
            placeholder="Transfer / terminal / portal reference"
            onChange={(e) => setReference(e.target.value)}
          />
        </label>
        <label className="refund-field">
          <span className="job-detail-notes-label">
            Note<span className="refund-optional"> (optional)</span>
          </span>
          <textarea
            className="job-detail-notes"
            rows={3}
            maxLength={1000}
            value={note}
            disabled={busy}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        {error && <p className="job-detail-modal-error">{error}</p>}
        <div className="job-detail-modal-actions">
          <button type="button" className="job-detail-secondary-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <PrimaryButton width="170px" onClick={submit} disabled={busy || !reference.trim()}>
            {busy ? "Saving…" : "Mark paid"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

/** Finance job detail: payment state, mark paid, request refund, refund cases. */
function JobPayments({ job, onChanged }) {
  const [modal, setModal] = useState(null);
  const [openRefundId, setOpenRefundId] = useState(null);
  const [message, setMessage] = useState("");
  const { data } = useListRefundsQuery({ jobId: job._id, limit: 50 });
  const refunds = data?.refunds || [];
  const status = job.payment_status || "unpaid";
  const paid = status === "paid" || status === "partially_refunded";
  const canMarkPaid = status === "unpaid" && job.job_status !== "cancelled";

  return (
    <section className="job-detail-card">
      <h2>Payment &amp; refunds</h2>
      <dl className="job-detail-dl">
        <dt>Payment status</dt>
        <dd>{status}</dd>
        {job.refunded_amount > 0 && (
          <>
            <dt>Refunded</dt>
            <dd>{formatMoney(job.refunded_amount)}</dd>
          </>
        )}
      </dl>
      {refunds.length > 0 && (
        <ul className="job-payments-list">
          {refunds.map((r) => (
            <li key={r._id} onClick={() => setOpenRefundId(r._id)}>
              <span>
                <strong>{formatMoney(r.amount)}</strong> · {r.reason}
                <span className="refund-sub"> · {formatDateTime(r.createdAt)}</span>
              </span>
              <RefundStatusBadge status={r.status} />
            </li>
          ))}
        </ul>
      )}
      {message && <p className="job-detail-modal-hint">{message}</p>}
      <div className="job-payments-actions">
        {canMarkPaid && (
          <button type="button" className="job-detail-secondary-btn" onClick={() => setModal("markPaid")}>
            Mark paid
          </button>
        )}
        {paid && (
          <button type="button" className="job-detail-secondary-btn" onClick={() => setModal("refund")}>
            Request refund
          </button>
        )}
      </div>
      {modal === "markPaid" && (
        <MarkPaidModal
          jobId={job._id}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null);
            setMessage("Job marked paid.");
            onChanged?.();
          }}
        />
      )}
      {modal === "refund" && (
        <RequestRefundModal
          jobId={job._id}
          label={[job.job_reference, job.clientName].filter(Boolean).join(" · ")}
          onClose={() => setModal(null)}
          onDone={(refund) => {
            setModal(null);
            setMessage(`Refund of ${formatMoney(refund?.amount)} requested — awaiting approval by another finance admin.`);
            onChanged?.();
          }}
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
    </section>
  );
}

export default JobPayments;
