import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useGetRefundQuery } from "../../store/paymentsApi";
import { useAdminRole } from "../../utils/adminRoles";
import {
  ApproveRefundModal,
  REFUND_APPROVER_ROLES,
  REFUND_STATUS,
  RefundStatusBadge,
  RejectRefundModal,
  actorLabel,
  formatDateTime,
  formatMoney,
  hasCreditNote,
  isRefundOpen,
  jobIdOf,
  jobLabel,
  useCreditNoteDownload,
  useCurrentAdminId,
} from "./paymentUi.jsx";

const BANNERS = {
  requested: {
    tone: "pending",
    text: "Waiting for a Super Admin (or finance admin) other than the requester to approve or reject it. No money has moved.",
  },
  processing: {
    tone: "info",
    text: "Sent to SkipCash — awaiting confirmation. The credit note and the job's payment status update when SkipCash confirms the refund.",
  },
  failed: {
    tone: "danger",
    text: "The refund did not go through. Retry it, or refund in the SkipCash portal / by cash and record the reference.",
  },
  succeeded: { tone: "success", text: "Refunded." },
  rejected: { tone: "muted", text: "Rejected." },
};

/** Refund case detail with approve / reject / credit note. */
function RefundDetailModal({ refundId, onClose }) {
  const { data, isLoading, refetch } = useGetRefundQuery(refundId, {
    refetchOnMountOrArgChange: true,
  });
  const { role } = useAdminRole();
  const myId = useCurrentAdminId();
  const { download, downloading } = useCreditNoteDownload();
  const [action, setAction] = useState(null);
  const refund = data?.refund;

  const close = () => setAction(null);
  const done = () => {
    setAction(null);
    refetch();
  };

  const approver = REFUND_APPROVER_ROLES.includes(role);
  const iRequested =
    refund?.requested_by?.id && String(refund.requested_by.id) === String(myId);
  const jobId = jobIdOf(refund);
  const banner = refund ? BANNERS[refund.status] : null;

  const rows = refund
    ? [
        ["Status", REFUND_STATUS[refund.status]?.label || refund.status],
        ["Amount", formatMoney(refund.amount)],
        [refund.kind === "membership" ? "Membership" : "Job", jobLabel(refund)],
        refund.job && [
          "Job payment",
          [
            refund.job.payment_status,
            refund.job.payment_method,
            refund.job.refunded_amount ? `refunded ${formatMoney(refund.job.refunded_amount)}` : "",
          ]
            .filter(Boolean)
            .join(" · "),
        ],
        ["Reason", refund.reason || "—"],
        ["Method", refund.method === "manual" ? "Manual (cash / bank / portal reference)" : "SkipCash card refund"],
        ["Source", refund.source || "—"],
        ["Requested by", `${actorLabel(refund.requested_by, myId)} · ${formatDateTime(refund.createdAt)}`],
        refund.approved_by && [
          "Approved by",
          `${actorLabel(refund.approved_by, myId)} · ${formatDateTime(refund.approved_at)}`,
        ],
        refund.provider_submitted_at && ["Sent to SkipCash", formatDateTime(refund.provider_submitted_at)],
        refund.provider_refund_id && ["SkipCash refund id", refund.provider_refund_id],
        refund.provider_confirmed_at && ["Confirmed by SkipCash", formatDateTime(refund.provider_confirmed_at)],
        refund.manual_reference && ["Manual reference", refund.manual_reference],
        refund.completed_at && ["Completed", formatDateTime(refund.completed_at)],
        refund.error && ["Last error", refund.error],
        refund.rejected_by && ["Rejected by", actorLabel(refund.rejected_by, myId)],
        refund.rejection_reason && ["Rejection reason", refund.rejection_reason],
        refund.credit_note_number && ["Credit note", refund.credit_note_number],
      ].filter(Boolean)
    : [];

  return (
    <>
      <div className="confirmation-modal-backdrop" role="presentation">
        <div className="confirmation-modal pay-modal pay-modal--wide" role="dialog" aria-modal="true">
          <button className="confirmation-modal-close" onClick={onClose} aria-label="Close">
            <span className="confirmation-modal-close-x">&#10005;</span>
          </button>
          <div className="pay-modal-body">
            {isLoading && <p>Loading…</p>}
            {!isLoading && !refund && <p className="pay-error">Refund not found.</p>}
            {refund && (
              <>
                <div className="pay-detail-head">
                  <div className="confirmation-modal-title">
                    Refund {formatMoney(refund.amount)}
                  </div>
                  <RefundStatusBadge status={refund.status} />
                </div>
                {banner && <div className={`pay-banner pay-banner--${banner.tone}`}>{banner.text}</div>}
                <dl className="pay-dl">
                  {rows.map(([k, v]) => (
                    <React.Fragment key={k}>
                      <dt>{k}</dt>
                      <dd className={k === "Last error" ? "pay-error-text" : undefined}>{v}</dd>
                    </React.Fragment>
                  ))}
                </dl>
                {jobId && (
                  <Link className="pay-link" to={`/jobs/${jobId}`} onClick={onClose}>
                    Open job →
                  </Link>
                )}
                {isRefundOpen(refund.status) && !approver && (
                  <p className="pay-hint">
                    Only a Super Admin who did not request this refund can approve or reject it.
                  </p>
                )}
                {isRefundOpen(refund.status) && approver && iRequested && (
                  <p className="pay-error">
                    You requested this refund, so the server will refuse your approval — ask another Super Admin.
                  </p>
                )}
                <div className="confirmation-modal-actions">
                  {hasCreditNote(refund) && (
                    <button
                      className="confirmation-modal-cancel"
                      onClick={() => download(refund)}
                      disabled={downloading}
                    >
                      {downloading ? "Downloading…" : "Download credit note"}
                    </button>
                  )}
                  {isRefundOpen(refund.status) && approver && (
                    <>
                      <button className="confirmation-modal-cancel" onClick={() => setAction("reject")}>
                        Reject
                      </button>
                      <button className="confirmation-modal-confirm" onClick={() => setAction("approve")}>
                        {refund.status === "failed" ? "Retry / complete" : "Approve"}
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      {action === "approve" && refund && (
        <ApproveRefundModal refund={refund} onClose={close} onDone={done} onFailed={refetch} />
      )}
      {action === "reject" && refund && (
        <RejectRefundModal refund={refund} onClose={close} onDone={done} />
      )}
    </>
  );
}

export default RefundDetailModal;
