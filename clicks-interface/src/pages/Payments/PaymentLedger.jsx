import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import DataTable from "../../components/DataTable/DataTable.jsx";
import { useGetPaymentAttemptsQuery } from "../../store/paymentsApi";
import RefundDetailModal from "./RefundDetailModal.jsx";
import {
  Badge,
  RequestRefundModal,
  formatDateTime,
  formatMoney,
  jobIdOf,
  jobLabel,
} from "./paymentUi.jsx";
import "../../components/ConfirmationModal.css";
import "./Payments.css";

const LIMIT = 200;
const FILTERS = [
  { value: "", label: "All" },
  { value: "stale", label: "Stale pending (>48h)" },
  { value: "outcome:duplicate_capture", label: "Duplicate capture" },
  { value: "outcome:amount_mismatch", label: "Amount mismatch" },
  { value: "status:pending", label: "Pending" },
  { value: "status:paid", label: "Paid" },
  { value: "status:failed", label: "Failed" },
  { value: "status:partially_refunded", label: "Partially refunded" },
  { value: "status:refunded", label: "Refunded" },
];

const STATUS_TONE = {
  pending: "pending",
  paid: "success",
  failed: "danger",
  cancelled: "muted",
  partially_refunded: "info",
  refunded: "info",
};

function queryFor(filter) {
  if (filter === "stale") return { stale: true, limit: LIMIT };
  if (filter.includes(":")) {
    const [key, value] = filter.split(":");
    return { [key]: value, limit: LIMIT };
  }
  return { limit: LIMIT };
}

function isStale(a) {
  if (a.status !== "pending") return false;
  const created = new Date(a.createdAt).getTime();
  return Number.isFinite(created) && Date.now() - created > 48 * 3600 * 1000;
}

function isFlagged(a) {
  return a.outcome === "duplicate_capture" || a.outcome === "amount_mismatch";
}

function FlagBadge({ attempt }) {
  if (attempt.outcome === "duplicate_capture") return <Badge tone="danger">DUPLICATE CAPTURE</Badge>;
  if (attempt.outcome === "amount_mismatch") return <Badge tone="warning">AMOUNT MISMATCH</Badge>;
  if (isStale(attempt)) return <Badge tone="pending">Stale &gt;48h</Badge>;
  if (!attempt.outcome) return <span className="pay-sub">—</span>;
  return <Badge tone={attempt.outcome === "applied" ? "success" : "muted"}>{attempt.outcome}</Badge>;
}

function AttemptModal({ attempt, onClose, onRequestRefund, onOpenRefund }) {
  const jobId = jobIdOf(attempt);
  const events = [...(attempt.events || [])].reverse();
  return (
    <div className="confirmation-modal-backdrop" role="presentation">
      <div className="confirmation-modal pay-modal pay-modal--wide" role="dialog" aria-modal="true">
        <button className="confirmation-modal-close" onClick={onClose} aria-label="Close">
          <span className="confirmation-modal-close-x">&#10005;</span>
        </button>
        <div className="pay-modal-body">
          <div className="pay-detail-head">
            <div className="confirmation-modal-title">
              {formatMoney(attempt.amount)} · {attempt.status}
            </div>
            <FlagBadge attempt={attempt} />
          </div>
          <p className="pay-modal-intro">
            {jobLabel(attempt)} · SkipCash id {attempt.provider_payment_id}
          </p>
          {attempt.outcome === "duplicate_capture" && (
            <div className="pay-banner pay-banner--danger">
              This capture did not pay the job — the customer was charged twice.{" "}
              {attempt.refund_case_id ? "A refund case is open for it." : "Open a refund case for it."}
            </div>
          )}
          {attempt.outcome === "amount_mismatch" && (
            <div className="pay-banner pay-banner--danger">
              Captured {formatMoney(attempt.amount)} but the job owed{" "}
              {formatMoney(attempt.expected_amount)} when it was applied. Review the job total.
            </div>
          )}
          <h4 className="pay-subtitle">Events</h4>
          {events.length === 0 && <p className="pay-sub">No events</p>}
          <ol className="pay-events">
            {events.map((e, i) => (
              <li key={i}>
                <strong>
                  {e.source} · {e.status}
                  {e.amount ? ` · QAR ${e.amount}` : ""}
                </strong>
                <span className="pay-sub">
                  {formatDateTime(e.at)}
                  {e.note ? ` · ${e.note}` : ""}
                </span>
              </li>
            ))}
          </ol>
          <div className="confirmation-modal-actions">
            {jobId && (
              <Link className="confirmation-modal-cancel pay-link-btn" to={`/jobs/${jobId}`}>
                Open job
              </Link>
            )}
            {attempt.refund_case_id && (
              <button className="confirmation-modal-cancel" onClick={onOpenRefund}>
                Open refund case
              </button>
            )}
            {!attempt.refund_case_id && jobId && attempt.outcome === "duplicate_capture" && (
              <button className="confirmation-modal-confirm" onClick={onRequestRefund}>
                Request refund of this capture
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PaymentLedger() {
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [refundFor, setRefundFor] = useState(null);
  const [openRefundId, setOpenRefundId] = useState(null);
  const { data, isLoading, isFetching, error } = useGetPaymentAttemptsQuery(queryFor(filter));
  const attempts = useMemo(() => data?.attempts || [], [data]);
  const pageRows = attempts.slice((page - 1) * 20, page * 20);
  const flagged = attempts.filter(isFlagged).length;

  const wrap = (row, node) => (
    <div className={`pay-row-click${isFlagged(row) ? " pay-flagged" : ""}`} onClick={() => setSelected(row)}>
      {node}
    </div>
  );

  const columns = [
    {
      title: "Job / created",
      key: "job",
      width: "26%",
      render: (row) =>
        wrap(
          row,
          <div className="pay-cell">
            <strong>{jobLabel(row)}</strong>
            <span className="pay-sub">
              {row.kind} · {formatDateTime(row.createdAt)}
            </span>
          </div>
        ),
    },
    {
      title: "Amount",
      key: "amount",
      width: "16%",
      render: (row) =>
        wrap(
          row,
          <div className="pay-cell">
            <strong className={row.outcome === "amount_mismatch" ? "pay-error-text" : undefined}>
              {formatMoney(row.amount)}
            </strong>
            {row.outcome === "amount_mismatch" && row.expected_amount != null && (
              <span className="pay-sub">expected {formatMoney(row.expected_amount)}</span>
            )}
            {row.refunded_amount > 0 && (
              <span className="pay-sub">refunded {formatMoney(row.refunded_amount)}</span>
            )}
          </div>
        ),
    },
    {
      title: "Status",
      key: "status",
      width: "14%",
      render: (row) => wrap(row, <Badge tone={STATUS_TONE[row.status] || "muted"}>{row.status}</Badge>),
    },
    {
      title: "Flag",
      key: "flag",
      width: "18%",
      render: (row) => wrap(row, <FlagBadge attempt={row} />),
    },
    {
      title: "SkipCash id",
      key: "pid",
      width: "26%",
      render: (row) =>
        wrap(
          row,
          <div className="pay-cell">
            <span className="pay-mono">{row.provider_payment_id}</span>
            {row.transaction_id && <span className="pay-sub">tx {row.transaction_id}</span>}
          </div>
        ),
    },
  ];

  return (
    <div className="admin-page admin-page--scroll pay-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Payment ledger</h1>
          <p className="pay-page-intro">
            Every SkipCash payment link and capture. Red rows need a person: a duplicate capture
            should be refunded, an amount mismatch reviewed. &quot;Stale&quot; links have been pending
            for more than 48 hours.
          </p>
        </div>
      </div>
      <div className="pay-chips">
        {FILTERS.map((f) => (
          <button
            key={f.value || "all"}
            type="button"
            className={`pay-chip${filter === f.value ? " active" : ""}`}
            onClick={() => {
              setFilter(f.value);
              setPage(1);
            }}
          >
            {f.label}
          </button>
        ))}
      </div>
      {error && <p className="pay-error">{error?.data?.message || "Failed to load the ledger"}</p>}
      <DataTable
        title="Payment ledger"
        hideTitle
        hideSearch
        hideFilterIcon
        columns={columns}
        data={pageRows}
        loading={isLoading}
        fetching={isFetching && !isLoading}
        pagination={{ current: page, total: attempts.length, pageSize: 20, onChange: setPage }}
      />
      <p className="pay-sub">
        {attempts.length >= LIMIT
          ? `Showing the latest ${LIMIT} attempts. Narrow the filter to see older ones.`
          : flagged > 0
            ? `${flagged} flagged capture(s) in this list.`
            : ""}
      </p>
      {selected && (
        <AttemptModal
          attempt={selected}
          onClose={() => setSelected(null)}
          onRequestRefund={() => {
            setRefundFor(selected);
            setSelected(null);
          }}
          onOpenRefund={() => {
            setOpenRefundId(String(selected.refund_case_id));
            setSelected(null);
          }}
        />
      )}
      {refundFor && (
        <RequestRefundModal
          jobId={jobIdOf(refundFor)}
          attemptId={refundFor._id}
          label={`Duplicate capture ${formatMoney(refundFor.amount)} on ${jobLabel(refundFor)}`}
          onClose={() => setRefundFor(null)}
          onDone={() => {
            setRefundFor(null);
            alert("Refund requested — awaiting approval by another Super Admin");
          }}
        />
      )}
      {openRefundId && (
        <RefundDetailModal refundId={openRefundId} onClose={() => setOpenRefundId(null)} />
      )}
    </div>
  );
}

export default PaymentLedger;
