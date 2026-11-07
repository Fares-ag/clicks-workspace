import React, { useState } from "react";
import { useListRefundsQuery } from "../../store/refundsApi";
import {
  FINANCE_REFUND_APPROVER,
  RefundDetailModal,
  RefundStatusBadge,
  actorLabel,
  formatDateTime,
  formatMoney,
  jobLabel,
  useFinanceMe,
} from "./refundUi.jsx";
import "./Refunds.css";

const FILTERS = [
  { value: "requested", label: "Awaiting approval" },
  { value: "processing", label: "Awaiting SkipCash" },
  { value: "failed", label: "Failed" },
  { value: "succeeded", label: "Refunded" },
  { value: "rejected", label: "Rejected" },
  { value: "", label: "All" },
];

const PAGE_SIZE = 20;

function Refunds() {
  const [status, setStatus] = useState("requested");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState(null);
  const me = useFinanceMe();
  const { data, isLoading, isFetching, error } = useListRefundsQuery({ status, page, limit: PAGE_SIZE });
  const refunds = data?.refunds || [];
  const total = data?.total || 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const approver = me.role === FINANCE_REFUND_APPROVER;

  return (
    <div className="refunds-page">
      <div className="refunds-header">
        <h1 className="refunds-title">Refunds</h1>
        <p className="refunds-subtitle">
          {approver
            ? "Approve or reject refund cases you did not request yourself. Card refunds stay \"Awaiting SkipCash\" until SkipCash confirms; the credit note is issued then. Cash / portal refunds need the reference."
            : "Refund cases opened by finance or admins. A finance admin other than the requester approves them. Request a refund from a paid job."}
        </p>
      </div>
      <div className="refund-chips">
        {FILTERS.map((f) => (
          <button
            key={f.value || "all"}
            type="button"
            className={`refund-chip${status === f.value ? " active" : ""}`}
            onClick={() => {
              setStatus(f.value);
              setPage(1);
            }}
          >
            {f.label}
          </button>
        ))}
      </div>
      {error && <p className="job-detail-modal-error">{error?.data?.message || "Failed to load refunds"}</p>}
      <div className={`job-detail-table-wrap refunds-table-wrap${isFetching ? " refunds-fetching" : ""}`}>
        <table className="job-detail-table refunds-table">
          <thead>
            <tr>
              <th>Job</th>
              <th>Amount</th>
              <th>Reason</th>
              <th>Requested</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5}>Loading…</td>
              </tr>
            )}
            {!isLoading && refunds.length === 0 && (
              <tr>
                <td colSpan={5}>No refund cases.</td>
              </tr>
            )}
            {refunds.map((r) => (
              <tr key={r._id} className="refund-row" onClick={() => setOpenId(r._id)}>
                <td>
                  <strong>{jobLabel(r)}</strong>
                  {r.kind === "membership" && <div className="refund-sub">Membership</div>}
                </td>
                <td>
                  <strong>{formatMoney(r.amount)}</strong>
                </td>
                <td>
                  <div>{r.reason}</div>
                  <div className="refund-sub">
                    {r.source} · {r.method === "manual" ? "manual (cash/portal)" : "SkipCash"}
                  </div>
                </td>
                <td>
                  <div>{actorLabel(r.requested_by, me.id)}</div>
                  <div className="refund-sub">{formatDateTime(r.createdAt)}</div>
                </td>
                <td>
                  <RefundStatusBadge status={r.status} />
                  {r.status === "failed" && r.error && <div className="refund-sub refund-error-text">{r.error}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="refund-pager">
          <button type="button" className="job-detail-secondary-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            ← Previous
          </button>
          <span>
            Page {page} of {pages}
          </span>
          <button type="button" className="job-detail-secondary-btn" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Next →
          </button>
        </div>
      )}
      {openId && <RefundDetailModal refundId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

export default Refunds;
