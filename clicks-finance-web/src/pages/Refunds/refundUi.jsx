import React, { useState } from "react";
import { Link } from "react-router-dom";
import PrimaryButton from "../../components/PrimaryButton.jsx";
import { useMeQuery } from "../../store/portalApi";
import {
  useApproveRefundMutation,
  useGetRefundQuery,
  useLazyDownloadCreditNoteQuery,
  useRejectRefundMutation,
  useRequestRefundMutation,
} from "../../store/refundsApi";
import "../JobDetail/JobDetail.css";
import "./Refunds.css";

/** Finance role that may approve / reject refunds (never the requester). */
export const FINANCE_REFUND_APPROVER = "admin";

export const REFUND_STATUS = {
  requested: { label: "Awaiting approval", tone: "pending" },
  processing: { label: "Sent to SkipCash — awaiting confirmation", short: "Awaiting SkipCash", tone: "info" },
  succeeded: { label: "Refunded", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  rejected: { label: "Rejected", tone: "muted" },
};

export const isRefundOpen = (status) => status === "requested" || status === "failed";

export function RefundStatusBadge({ status }) {
  const s = REFUND_STATUS[status] || { label: status || "—", tone: "muted" };
  return <span className={`refund-badge refund-badge--${s.tone}`}>{s.short || s.label}</span>;
}

export function formatMoney(value) {
  const n = Number(value);
  if (value == null || value === "" || !Number.isFinite(n)) return "—";
  return `QAR ${n.toFixed(2)}`;
}

export function formatDateTime(raw) {
  if (!raw) return "—";
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

const shortId = (id) => (id ? `#${String(id).slice(-6)}` : "—");

export function actorLabel(actor, myId) {
  if (!actor || typeof actor !== "object") return "—";
  const { type = "", role = "", name = "", id = "" } = actor;
  const who = name || role || type || "system";
  const tail = id && !name ? ` ${shortId(id)}` : "";
  const prefix = type && who !== type ? `${type} · ` : "";
  const mine = id && myId && String(id) === String(myId) ? " (you)" : "";
  return `${prefix}${who}${tail}${mine}`;
}

export function jobLabel(row) {
  const job = row?.job;
  if (job) {
    const head = String(job.job_reference || "").trim() || shortId(job._id);
    return job.clientName ? `${head} · ${job.clientName}` : head;
  }
  if (row?.job_id) return `Job ${shortId(row.job_id)}`;
  if (row?.subscription_id) return `Membership ${shortId(row.subscription_id)}`;
  return "—";
}

/** Finance user's role and id from /finance/me. */
export function useFinanceMe() {
  const { data } = useMeQuery();
  const user = data?.user || {};
  return { role: user.role || "", id: String(user.id || user._id || "") };
}

export function errorText(err, fallback = "Request failed") {
  const data = err?.data || {};
  const message = data.message || data.error || fallback;
  switch (data.code) {
    case "REFUND_SAME_APPROVER":
      return `${message}. Ask another finance admin to approve it.`;
    case "REFUND_APPROVER_ROLE":
      return `${message}. Only the finance "admin" role can approve or reject refunds.`;
    case "REFUND_REFERENCE_REQUIRED":
      return `${message}. Enter the reference of the cash / bank / portal refund.`;
    case "REFUND_PROVIDER_FAILED":
      return `${message} The case is now Failed.`;
    default:
      return message;
  }
}

/** Modal form that stays open until the server accepts the call. */
export function FormModal({ title, intro, fields = [], confirmLabel = "Save", onSubmit, onClose, validate }) {
  const [values, setValues] = useState(() => Object.fromEntries(fields.map((f) => [f.key, ""])));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const v = Object.fromEntries(Object.entries(values).map(([k, x]) => [k, String(x || "").trim()]));
    const missing = fields.find((f) => f.required && !v[f.key]);
    if (missing) return setError(`${missing.label} is required`);
    const invalid = validate?.(v);
    if (invalid) return setError(invalid);
    setBusy(true);
    setError("");
    try {
      await onSubmit(v);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
    return undefined;
  };

  return (
    <div className="job-detail-modal-backdrop" role="presentation">
      <div className="job-detail-modal" role="dialog" aria-modal="true">
        <h2 className="job-detail-modal-title">{title}</h2>
        {intro && <p className="job-detail-modal-copy">{intro}</p>}
        {fields.map((f) => (
          <label key={f.key} className="refund-field">
            <span className="job-detail-notes-label">
              {f.label}
              {!f.required && <span className="refund-optional"> (optional)</span>}
            </span>
            {f.type === "textarea" ? (
              <textarea
                className="job-detail-notes"
                rows={3}
                maxLength={1000}
                value={values[f.key]}
                disabled={busy}
                onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.value }))}
              />
            ) : (
              <input
                className="refund-input"
                type={f.type === "number" ? "number" : "text"}
                min={f.type === "number" ? "0" : undefined}
                step={f.type === "number" ? "0.01" : undefined}
                maxLength={200}
                value={values[f.key]}
                disabled={busy}
                onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.value }))}
              />
            )}
            {f.hint && <span className="job-detail-modal-hint">{f.hint}</span>}
          </label>
        ))}
        {error && <p className="job-detail-modal-error">{error}</p>}
        <div className="job-detail-modal-actions">
          <button type="button" className="job-detail-secondary-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <PrimaryButton width="170px" onClick={submit} disabled={busy}>
            {busy ? "Working…" : confirmLabel}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

export function RequestRefundModal({ jobId, label, onClose, onDone }) {
  const [requestRefund] = useRequestRefundMutation();
  return (
    <FormModal
      title="Request refund"
      intro={`${label ? `${label}. ` : ""}Opens a refund case. A finance admin (or Super Admin) other than you must approve it before any money moves.`}
      fields={[
        { key: "amount", label: "Amount (QAR)", type: "number", hint: "Leave empty to refund everything still refundable" },
        { key: "reason", label: "Reason", required: true, type: "textarea" },
      ]}
      confirmLabel="Request refund"
      validate={(v) => (v.amount && !(Number(v.amount) > 0) ? "Enter a positive amount, or leave it empty" : null)}
      onClose={onClose}
      onSubmit={async (v) => {
        const res = await requestRefund({
          job_id: jobId,
          reason: v.reason,
          ...(v.amount ? { amount: Number(v.amount) } : {}),
        }).unwrap();
        onDone?.(res.refund);
      }}
    />
  );
}

function ApproveRefundModal({ refund, onClose, onDone, onFailed }) {
  const [approveRefund] = useApproveRefundMutation();
  const manual = refund.method === "manual";
  const failed = refund.status === "failed";
  const amount = formatMoney(refund.amount);
  return (
    <FormModal
      title={failed ? "Retry / complete refund" : "Approve refund"}
      intro={
        manual
          ? `Approve a refund of ${amount}. This payment was not taken by card: refund the customer (cash / bank / wallet) and record the reference.`
          : failed
            ? `The last SkipCash attempt failed: ${refund.error || "unknown error"}. Leave the reference empty to retry at SkipCash, or refund in the SkipCash portal and enter its reference to close the case.`
            : `Approve a refund of ${amount}. It is sent to SkipCash and stays "awaiting confirmation" until SkipCash confirms it; the credit note is issued then.`
      }
      fields={manual || failed ? [{ key: "manual_reference", label: "Refund reference", required: manual }] : []}
      confirmLabel={failed && !manual ? "Submit" : "Approve"}
      onClose={onClose}
      onSubmit={async (v) => {
        try {
          const res = await approveRefund({ id: refund._id, manual_reference: v.manual_reference || undefined }).unwrap();
          onDone?.(res.refund);
        } catch (err) {
          onFailed?.();
          throw err;
        }
      }}
    />
  );
}

function RejectRefundModal({ refund, onClose, onDone }) {
  const [rejectRefund] = useRejectRefundMutation();
  return (
    <FormModal
      title="Reject refund"
      intro={`Close this case without refunding ${formatMoney(refund.amount)}.`}
      fields={[{ key: "reason", label: "Reason", required: true, type: "textarea" }]}
      confirmLabel="Reject"
      onClose={onClose}
      onSubmit={async (v) => {
        const res = await rejectRefund({ id: refund._id, reason: v.reason }).unwrap();
        onDone?.(res.refund);
      }}
    />
  );
}

const BANNERS = {
  requested: "Waiting for a finance admin (or Super Admin) other than the requester to approve or reject it. No money has moved.",
  processing: "Sent to SkipCash — awaiting confirmation. The credit note and the job's payment status update when SkipCash confirms the refund.",
  failed: "The refund did not go through. Retry it, or refund in the SkipCash portal / by cash and record the reference.",
  succeeded: "Refunded.",
  rejected: "Rejected.",
};

/** Refund detail with approve / reject / credit note for the finance portal. */
export function RefundDetailModal({ refundId, onClose }) {
  const { data, isLoading, refetch } = useGetRefundQuery(refundId, { refetchOnMountOrArgChange: true });
  const me = useFinanceMe();
  const [action, setAction] = useState(null);
  const [downloadNote, { isFetching: downloading }] = useLazyDownloadCreditNoteQuery();
  const refund = data?.refund;
  const approver = me.role === FINANCE_REFUND_APPROVER;
  const iRequested = refund?.requested_by?.id && String(refund.requested_by.id) === me.id;
  const jobId = refund?.job?._id || refund?.job_id;
  const canDownload = refund?.status === "succeeded" && refund?.credit_note_number && refund?.job_id;

  const done = () => {
    setAction(null);
    refetch();
  };

  const download = async () => {
    try {
      const blob = await downloadNote(refund._id).unwrap();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sanadcom-credit-note-${String(refund.credit_note_number).replace(/[^\w.-]+/g, "-")}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(errorText(err, "Failed to download the credit note"));
    }
  };

  const rows = refund
    ? [
        ["Status", REFUND_STATUS[refund.status]?.label || refund.status],
        ["Amount", formatMoney(refund.amount)],
        [refund.kind === "membership" ? "Membership" : "Job", jobLabel(refund)],
        refund.job && ["Job payment", [refund.job.payment_status, refund.job.payment_method].filter(Boolean).join(" · ")],
        ["Reason", refund.reason || "—"],
        ["Method", refund.method === "manual" ? "Manual (cash / bank / portal reference)" : "SkipCash card refund"],
        ["Source", refund.source || "—"],
        ["Requested by", `${actorLabel(refund.requested_by, me.id)} · ${formatDateTime(refund.createdAt)}`],
        refund.approved_by && ["Approved by", `${actorLabel(refund.approved_by, me.id)} · ${formatDateTime(refund.approved_at)}`],
        refund.provider_submitted_at && ["Sent to SkipCash", formatDateTime(refund.provider_submitted_at)],
        refund.provider_refund_id && ["SkipCash refund id", refund.provider_refund_id],
        refund.provider_confirmed_at && ["Confirmed by SkipCash", formatDateTime(refund.provider_confirmed_at)],
        refund.manual_reference && ["Manual reference", refund.manual_reference],
        refund.completed_at && ["Completed", formatDateTime(refund.completed_at)],
        refund.error && ["Last error", refund.error],
        refund.rejected_by && ["Rejected by", actorLabel(refund.rejected_by, me.id)],
        refund.rejection_reason && ["Rejection reason", refund.rejection_reason],
        refund.credit_note_number && ["Credit note", refund.credit_note_number],
      ].filter(Boolean)
    : [];

  return (
    <>
      <div
        className="job-detail-modal-backdrop"
        role="presentation"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !action) onClose();
        }}
      >
        <div className="job-detail-modal refund-modal--wide" role="dialog" aria-modal="true">
          {isLoading && <p>Loading…</p>}
          {!isLoading && !refund && <p className="job-detail-modal-error">Refund not found.</p>}
          {refund && (
            <>
              <div className="refund-detail-head">
                <h2 className="job-detail-modal-title">Refund {formatMoney(refund.amount)}</h2>
                <RefundStatusBadge status={refund.status} />
              </div>
              {BANNERS[refund.status] && (
                <p className={`refund-banner refund-banner--${REFUND_STATUS[refund.status]?.tone || "muted"}`}>
                  {BANNERS[refund.status]}
                </p>
              )}
              <dl className="job-detail-dl">
                {rows.map(([k, v]) => (
                  <React.Fragment key={k}>
                    <dt>{k}</dt>
                    <dd className={k === "Last error" ? "refund-error-text" : undefined}>{v}</dd>
                  </React.Fragment>
                ))}
              </dl>
              {jobId && refund.job && (
                <Link className="refund-link" to={`/jobs/${jobId}`} onClick={onClose}>
                  Open job →
                </Link>
              )}
              {isRefundOpen(refund.status) && !approver && (
                <p className="job-detail-modal-hint">
                  Only a finance admin who did not request this refund can approve or reject it.
                </p>
              )}
              {isRefundOpen(refund.status) && approver && iRequested && (
                <p className="job-detail-modal-error">
                  You requested this refund, so the server will refuse your approval — ask another finance admin.
                </p>
              )}
              <div className="job-detail-modal-actions">
                <button type="button" className="job-detail-secondary-btn" onClick={onClose}>
                  Close
                </button>
                {canDownload && (
                  <button type="button" className="job-detail-secondary-btn" onClick={download} disabled={downloading}>
                    {downloading ? "Downloading…" : "Download credit note"}
                  </button>
                )}
                {isRefundOpen(refund.status) && approver && (
                  <>
                    <button type="button" className="job-detail-secondary-btn" onClick={() => setAction("reject")}>
                      Reject
                    </button>
                    <PrimaryButton width="170px" onClick={() => setAction("approve")}>
                      {refund.status === "failed" ? "Retry / complete" : "Approve"}
                    </PrimaryButton>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      {action === "approve" && refund && (
        <ApproveRefundModal refund={refund} onClose={() => setAction(null)} onDone={done} onFailed={refetch} />
      )}
      {action === "reject" && refund && (
        <RejectRefundModal refund={refund} onClose={() => setAction(null)} onDone={done} />
      )}
    </>
  );
}
