import React, { useState } from "react";
import DataTable from "../../components/DataTable/DataTable.jsx";
import { useGetFailedOutboxQuery, useReplayOutboxMutation } from "../../store/paymentsApi";
import { errorText, formatDateTime } from "./paymentUi.jsx";
import "../../components/ConfirmationModal.css";
import "./Payments.css";

const PAGE_SIZE = 20;

function PayloadModal({ event, onClose }) {
  let pretty = "";
  try {
    pretty = JSON.stringify(event.payload, null, 2);
  } catch {
    pretty = String(event.payload ?? "");
  }
  return (
    <div className="confirmation-modal-backdrop" role="presentation">
      <div className="confirmation-modal pay-modal pay-modal--wide" role="dialog" aria-modal="true">
        <button className="confirmation-modal-close" onClick={onClose} aria-label="Close">
          <span className="confirmation-modal-close-x">&#10005;</span>
        </button>
        <div className="pay-modal-body">
          <div className="confirmation-modal-title">{event.type}</div>
          <h4 className="pay-subtitle">Last error</h4>
          <pre className="pay-pre pay-error-text">{event.last_error || "—"}</pre>
          <h4 className="pay-subtitle">Payload</h4>
          <pre className="pay-pre">{pretty}</pre>
        </div>
      </div>
    </div>
  );
}

/**
 * Outbox events (technician credit, partner earnings, ...) that failed every
 * retry. Replay requeues one with a fresh budget and runs it now; handlers are
 * idempotent, so a replay never double-pays.
 */
function FailedEvents() {
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState(null);
  const [replayingId, setReplayingId] = useState(null);
  const { data, isLoading, isFetching, error } = useGetFailedOutboxQuery({ page, limit: PAGE_SIZE });
  const [replay] = useReplayOutboxMutation();
  const events = data?.events || [];

  const onReplay = async (event) => {
    if (!window.confirm(`Re-run "${event.type}" now with a fresh retry budget?`)) return;
    setReplayingId(event._id);
    try {
      const res = await replay(event._id).unwrap();
      alert(
        res.delivered
          ? "Replayed and delivered."
          : "Requeued — it did not go through yet; the worker keeps retrying."
      );
    } catch (err) {
      alert(errorText(err, "Replay failed"));
    } finally {
      setReplayingId(null);
    }
  };

  const columns = [
    {
      title: "Type / created",
      key: "type",
      width: "24%",
      render: (row) => (
        <div className="pay-cell pay-row-click" onClick={() => setViewing(row)}>
          <strong>{row.type}</strong>
          <span className="pay-sub">{formatDateTime(row.created_at)}</span>
        </div>
      ),
    },
    { title: "Attempts", key: "attempts", width: "10%", render: (row) => row.attempts ?? 0 },
    {
      title: "Last error",
      key: "err",
      width: "50%",
      render: (row) => (
        <span className="pay-error-text pay-row-click" title={row.last_error} onClick={() => setViewing(row)}>
          {row.last_error || "—"}
        </span>
      ),
    },
    {
      title: "",
      key: "action",
      width: "16%",
      render: (row) => (
        <button
          type="button"
          className="btn-secondary pay-small-btn"
          disabled={replayingId === row._id}
          onClick={() => onReplay(row)}
        >
          {replayingId === row._id ? "Replaying…" : "Replay"}
        </button>
      ),
    },
  ];

  return (
    <div className="admin-page admin-page--scroll pay-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Failed events</h1>
          <p className="pay-page-intro">
            Background jobs (technician credit, partner earnings, ...) that failed every retry.
            Fix the cause, then Replay. Click a row for the payload.
          </p>
        </div>
      </div>
      {error && <p className="pay-error">{error?.data?.message || "Failed to load events"}</p>}
      <DataTable
        title="Failed events"
        hideTitle
        hideSearch
        hideFilterIcon
        columns={columns}
        data={events}
        loading={isLoading}
        fetching={isFetching && !isLoading}
        pagination={{ current: page, total: data?.total || 0, pageSize: PAGE_SIZE, onChange: setPage }}
      />
      {viewing && <PayloadModal event={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

export default FailedEvents;
