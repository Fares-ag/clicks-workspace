import React, { useState } from "react";
import { useSelector } from "react-redux";
import { decodeJwtPayload } from "../../utils/authRole";
import {
  useApproveRefundMutation,
  useLazyDownloadCreditNoteQuery,
  useRejectRefundMutation,
  useRequestRefundMutation,
} from "../../store/paymentsApi";
import "../../components/ConfirmationModal.css";
import "./Payments.css";

/** Roles the server lets approve or reject refunds (never the requester). */
export const REFUND_APPROVER_ROLES = ["Super Admin"];

export const REFUND_STATUS = {
  requested: { label: "Awaiting approval", tone: "pending" },
  processing: { label: "Sent to SkipCash — awaiting confirmation", short: "Awaiting SkipCash", tone: "info" },
  succeeded: { label: "Refunded", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  rejected: { label: "Rejected", tone: "muted" },
};

/** Approve / reject are possible on a fresh case or a failed attempt. */
export const isRefundOpen = (status) => status === "requested" || status === "failed";

export function RefundStatusBadge({ status }) {
  const s = REFUND_STATUS[status] || { label: status || "—", tone: "muted" };
  return <span className={`pay-badge pay-badge--${s.tone}`}>{s.short || s.label}</span>;
}

export function Badge({ tone = "muted", children }) {
  return <span className={`pay-badge pay-badge--${tone}`}>{children}</span>;
}

export function formatMoney(value) {
  const n = Number(value);
  if (value == null || value === "" || !Number.isFinite(n)) return "—";
  return `QAR ${n.toFixed(2)}`;
}

export function formatDateTime(raw) {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function shortId(id) {
  const s = String(id || "");
  if (!s) return "—";
  return `#${s.slice(-6)}`;
}

export function useCurrentAdminId() {
  const user = useSelector((state) => state.auth.user);
  const token = useSelector((state) => state.auth.token);
  return String(user?.id || user?._id || decodeJwtPayload(token)?.id || "");
}

export function actorLabel(actor, myId) {
  if (!actor || typeof actor !== "object") return "—";
  const { type = "", role = "", name = "", id = "" } = actor;
  const who = name || role || type || "system";
  const tail = id && !name ? ` ${shortId(id)}` : "";
  const prefix = type && type !== "admin" && who !== type ? `${type} · ` : "";
  const mine = id && myId && String(id) === String(myId) ? " (you)" : "";
  return `${prefix}${who}${tail}${mine}`;
}

/** "JOB-REF · Client" from the server's job summary, else the id. */
export function jobLabel(row) {
  const job = row?.job;
  if (job) {
    const ref = String(job.job_reference || "").trim();
    const head = ref || shortId(job._id);
    return job.clientName ? `${head} · ${job.clientName}` : head;
  }
  if (row?.job_id) return `Job ${shortId(row.job_id)}`;
  if (row?.subscription_id) return `Membership ${shortId(row.subscription_id)}`;
  return "—";
}

export function jobIdOf(row) {
  return String(row?.job?._id || row?.job_id || "") || null;
}

/** Server message plus a plain-language hint for the codes ops will hit. */
export function errorText(err, fallback = "Request failed") {
  const data = err?.data || {};
  const message = data.message || data.error || err?.message || fallback;
  switch (data.code) {
    case "REFUND_SAME_APPROVER":
      return `${message}. Ask another Super Admin to approve it.`;
    case "REFUND_APPROVER_ROLE":
      return `${message}. Only a Super Admin can approve or reject refunds.`;
    case "REFUND_REFERENCE_REQUIRED":
      return `${message}. Enter the reference of the cash / bank / portal refund.`;
    case "REFUND_PROVIDER_FAILED":
      return `${message} The case is now Failed.`;
    case "REFUND_DECISION_FORBIDDEN":
      return `${message}.`;
    default:
      return message;
  }
}

/**
 * Small form modal that stays open until the server accepts the call, so a
 * refusal shows next to the inputs. `fields`: [{ key, label, required,
 * type: "text"|"number"|"textarea", hint }].
 */
export function FormModal({
  title,
  intro,
  fields = [],
  confirmLabel = "Save",
  danger = false,
  onSubmit,
  onClose,
  validate,
}) {
  const [values, setValues] = useState(() =>
    Object.fromEntries(fields.map((f) => [f.key, f.initial || ""]))
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const trimmed = Object.fromEntries(
      Object.entries(values).map(([k, v]) => [k, String(v || "").trim()])
    );
    const missing = fields.find((f) => f.required && !trimmed[f.key]);
    if (missing) {
      setError(`${missing.label} is required`);
      return;
    }
    const invalid = validate?.(trimmed);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSubmit(trimmed);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <div className="confirmation-modal-backdrop" role="presentation">
      <div className="confirmation-modal pay-modal" role="dialog" aria-modal="true">
        <button
          className="confirmation-modal-close"
          onClick={onClose}
          disabled={busy}
          aria-label="Close"
        >
          <span className="confirmation-modal-close-x">&#10005;</span>
        </button>
        <div className="pay-modal-body">
          <div className="confirmation-modal-title">{title}</div>
          {intro && <p className="pay-modal-intro">{intro}</p>}
          {fields.map((f) => (
            <label key={f.key} className="pay-field">
              <span className="pay-field-label">
                {f.label}
                {!f.required && <span className="pay-optional"> (optional)</span>}
              </span>
              {f.type === "textarea" ? (
                <textarea
                  rows={3}
                  maxLength={f.maxLength || 1000}
                  value={values[f.key]}
                  disabled={busy}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                />
              ) : (
                <input
                  type={f.type === "number" ? "number" : "text"}
                  min={f.type === "number" ? "0" : undefined}
                  step={f.type === "number" ? "0.01" : undefined}
                  maxLength={f.maxLength || 200}
                  value={values[f.key]}
                  disabled={busy}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                />
              )}
              {f.hint && <span className="pay-field-hint">{f.hint}</span>}
            </label>
          ))}
          {error && <p className="pay-error">{error}</p>}
          <div className="confirmation-modal-actions">
            <button className="confirmation-modal-cancel" onClick={onClose} disabled={busy}>
              Go Back
            </button>
            <button
              className={`confirmation-modal-confirm${danger ? " pay-danger-btn" : ""}`}
              onClick={submit}
              disabled={busy}
              style={{ opacity: busy ? 0.6 : 1 }}
            >
              {busy ? "Working..." : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RequestRefundModal({ jobId, attemptId, label, onClose, onDone }) {
  const [requestRefund] = useRequestRefundMutation();
  return (
    <FormModal
      title="Request refund"
      intro={`${label ? `${label}. ` : ""}Opens a refund case. A different Super Admin (or a finance admin) must approve it before any money moves.`}
      fields={[
        {
          key: "amount",
          label: "Amount (QAR)",
          type: "number",
          hint: "Leave empty to refund everything still refundable",
        },
        { key: "reason", label: "Reason", required: true, type: "textarea" },
      ]}
      confirmLabel="Request refund"
      validate={(v) =>
        v.amount && !(Number(v.amount) > 0) ? "Enter a positive amount, or leave it empty" : null
      }
      onClose={onClose}
      onSubmit={async (v) => {
        const res = await requestRefund({
          job_id: jobId,
          ...(attemptId ? { attempt_id: attemptId } : {}),
          reason: v.reason,
          ...(v.amount ? { amount: Number(v.amount) } : {}),
        }).unwrap();
        onDone?.(res.refund);
      }}
    />
  );
}

export function ApproveRefundModal({ refund, onClose, onDone, onFailed }) {
  const [approveRefund] = useApproveRefundMutation();
  const manual = refund.method === "manual";
  const failed = refund.status === "failed";
  const amount = formatMoney(refund.amount);
  const intro = manual
    ? `Approve a refund of ${amount}. This payment was not taken by card: refund the customer yourself (cash / bank / wallet) and record the reference.`
    : failed
      ? `The last SkipCash attempt failed: ${refund.error || "unknown error"}. Leave the reference empty to retry at SkipCash, or refund in the SkipCash portal and enter its reference to close the case.`
      : `Approve a refund of ${amount}. It is sent to SkipCash and stays "awaiting confirmation" until SkipCash confirms it; the credit note is issued then.`;
  return (
    <FormModal
      title={failed ? "Retry / complete refund" : "Approve refund"}
      intro={intro}
      fields={
        manual || failed
          ? [{ key: "manual_reference", label: "Refund reference", required: manual }]
          : []
      }
      confirmLabel={failed && !manual ? "Submit" : "Approve"}
      onClose={onClose}
      onSubmit={async (v) => {
        try {
          const res = await approveRefund({
            id: refund._id,
            manual_reference: v.manual_reference || undefined,
          }).unwrap();
          onDone?.(res.refund);
        } catch (err) {
          // A failed SkipCash call still moved the case to `failed`.
          onFailed?.();
          throw err;
        }
      }}
    />
  );
}

export function RejectRefundModal({ refund, onClose, onDone }) {
  const [rejectRefund] = useRejectRefundMutation();
  return (
    <FormModal
      title="Reject refund"
      intro={`Close this case without refunding ${formatMoney(refund.amount)}.`}
      fields={[{ key: "reason", label: "Reason", required: true, type: "textarea" }]}
      confirmLabel="Reject"
      danger
      onClose={onClose}
      onSubmit={async (v) => {
        const res = await rejectRefund({ id: refund._id, reason: v.reason }).unwrap();
        onDone?.(res.refund);
      }}
    />
  );
}

/** The credit note exists only after the refund has succeeded. */
export const hasCreditNote = (refund) =>
  refund?.status === "succeeded" && !!refund?.credit_note_number && !!refund?.job_id;

export function useCreditNoteDownload() {
  const [trigger, { isFetching }] = useLazyDownloadCreditNoteQuery();
  const download = async (refund) => {
    try {
      const blob = await trigger(refund._id).unwrap();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sanadcom-credit-note-${String(refund.credit_note_number || refund._id).replace(/[^\w.-]+/g, "-")}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(errorText(err, "Failed to download the credit note"));
    }
  };
  return { download, downloading: isFetching };
}
