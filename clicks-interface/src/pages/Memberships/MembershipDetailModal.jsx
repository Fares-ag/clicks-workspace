import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  useAdjustMembershipUsageMutation,
  useCancelMembershipMutation,
  useExtendMembershipMutation,
  useGetCustomerMembershipQuery,
  useRefundMembershipMutation,
} from "../../store/customerMembershipApi";
import {
  MembershipStatusBadge,
  apiError,
  customerLabel,
  formatDate,
  plateLabel,
  usageBuckets,
  usedFor,
} from "./membershipUi.jsx";
import { formatDateTime } from "../Payments/paymentUi.jsx";

function MembershipDetailModal({ membershipId, onClose }) {
  const { data, isLoading, refetch } = useGetCustomerMembershipQuery(membershipId, {
    refetchOnMountOrArgChange: true,
  });
  const sub = data?.subscription;
  const refunds = data?.refunds || [];
  const [action, setAction] = useState(null);
  const [reason, setReason] = useState("");
  const [days, setDays] = useState("30");
  const [months, setMonths] = useState("");
  const [amount, setAmount] = useState("");
  const [bucket, setBucket] = useState("");
  const [used, setUsed] = useState("");
  const [error, setError] = useState("");

  const [extend, { isLoading: extending }] = useExtendMembershipMutation();
  const [cancel, { isLoading: cancelling }] = useCancelMembershipMutation();
  const [refund, { isLoading: refunding }] = useRefundMembershipMutation();
  const [adjust, { isLoading: adjusting }] = useAdjustMembershipUsageMutation();
  const saving = extending || cancelling || refunding || adjusting;

  const buckets = useMemo(() => usageBuckets(sub), [sub]);
  const status = sub?.status || "";
  const canExtend = status === "active" || status === "expired";
  const canCancel = status === "active";

  function start(next) {
    setAction(next);
    setError("");
    setReason("");
    if (next === "usage") {
      const first = buckets[0] || "";
      setBucket(first);
      setUsed(String(usedFor(sub, first)));
    }
  }

  async function submit() {
    setError("");
    if (!reason.trim()) {
      setError("A reason is required");
      return;
    }
    try {
      if (action === "extend") {
        const body = { id: membershipId, reason: reason.trim() };
        if (months.trim()) body.months = Number(months);
        else body.days = Number(days);
        await extend(body).unwrap();
      } else if (action === "cancel_period_end" || action === "cancel_immediate") {
        await cancel({
          id: membershipId,
          mode: action === "cancel_immediate" ? "immediate" : "period_end",
          reason: reason.trim(),
        }).unwrap();
      } else if (action === "refund") {
        await refund({
          id: membershipId,
          reason: reason.trim(),
          ...(amount.trim() ? { amount: Number(amount) } : {}),
        }).unwrap();
      } else if (action === "usage") {
        await adjust({
          id: membershipId,
          bucket,
          used: Number(used),
          reason: reason.trim(),
        }).unwrap();
      }
      setAction(null);
      refetch();
    } catch (err) {
      setError(apiError(err, "Request failed"));
    }
  }

  const rows = sub
    ? [
        ["Customer", customerLabel(sub)],
        ["Phone", sub.customer?.phone || "—"],
        ["Plate", plateLabel(sub)],
        ["Package", `${sub.planName || sub.planCode || "—"} · ${sub.interval || ""}`],
        ["Price", sub.comp ? "Complimentary" : `QAR ${Number(sub.priceQar || 0).toFixed(2)}`],
        ["Starts", formatDate(sub.startDate)],
        ["Ends", formatDate(sub.endDate)],
        sub.cancel_at_period_end ? ["Cancel", "Ends at period end"] : null,
        sub.coversEmergency === true ? ["Emergency", "Covered"] : null,
      ].filter(Boolean)
    : [];

  return (
    <div className="confirmation-modal-backdrop" role="presentation">
      <div className="confirmation-modal pay-modal pay-modal--wide mp-modal" role="dialog" aria-modal="true">
        <button className="confirmation-modal-close" onClick={onClose} aria-label="Close">
          <span className="confirmation-modal-close-x">&#10005;</span>
        </button>
        <div className="pay-modal-body">
          {isLoading && <p>Loading…</p>}
          {!isLoading && !sub && <p className="pay-error">Membership not found.</p>}
          {sub && (
            <>
              <div className="pay-detail-head">
                <div className="confirmation-modal-title">{sub.planName || "Membership"}</div>
                <MembershipStatusBadge status={status} />
              </div>
              {sub.customer?.id && (
                <Link className="pay-link" to={`/clients/${sub.customer.id}`}>
                  Open client
                </Link>
              )}
              <dl className="pay-dl">
                {rows.map(([k, v]) => (
                  <React.Fragment key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </React.Fragment>
                ))}
              </dl>

              {buckets.length > 0 && (
                <>
                  <h3 className="mp-section">Usage</h3>
                  <ul className="pay-events">
                    {buckets.map((b) => (
                      <li key={b}>
                        <strong>{b}</strong>
                        <span className="pay-sub">{usedFor(sub, b)} used</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {(sub.history || []).length > 0 && (
                <>
                  <h3 className="mp-section">History</h3>
                  <ul className="pay-events">
                    {sub.history.slice().reverse().map((h, i) => (
                      <li key={`${h.at}-${i}`}>
                        <strong>{h.action}</strong>
                        <span className="pay-sub">
                          {formatDateTime(h.at)}
                          {h.note ? ` · ${h.note}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {refunds.length > 0 && (
                <>
                  <h3 className="mp-section">Refunds</h3>
                  <p className="pay-hint">
                    Approval is on the <Link to="/refunds">Refunds</Link> page.
                  </p>
                  <ul className="pay-events">
                    {refunds.map((r) => (
                      <li key={r._id || r.id}>
                        <strong>
                          QAR {Number(r.amount || 0).toFixed(2)} · {r.status}
                        </strong>
                        <span className="pay-sub">{r.reason}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <div className="pay-job-section">
                <div className="pay-actions">
                  {canExtend && (
                    <button type="button" className="pay-small-btn" onClick={() => start("extend")}>
                      Extend
                    </button>
                  )}
                  {buckets.length > 0 && (
                    <button type="button" className="pay-small-btn" onClick={() => start("usage")}>
                      Adjust usage
                    </button>
                  )}
                  {canCancel && (
                    <>
                      <button type="button" className="pay-small-btn" onClick={() => start("cancel_period_end")}>
                        Cancel at period end
                      </button>
                      <button type="button" className="pay-small-btn" onClick={() => start("cancel_immediate")}>
                        Cancel immediately
                      </button>
                    </>
                  )}
                  <button type="button" className="pay-small-btn" onClick={() => start("refund")}>
                    Request refund
                  </button>
                </div>
              </div>

              {action && (
                <div className="mp-action-form">
                  {action === "extend" && (
                    <div className="mp-grid">
                      <div className="pay-field">
                        <span className="pay-field-label">Days to add</span>
                        <input type="number" min="1" value={days} onChange={(e) => setDays(e.target.value)} />
                      </div>
                      <div className="pay-field">
                        <span className="pay-field-label">
                          Or months <span className="pay-optional">(overrides days)</span>
                        </span>
                        <input type="number" min="1" max="60" value={months} onChange={(e) => setMonths(e.target.value)} />
                      </div>
                    </div>
                  )}
                  {action === "usage" && (
                    <div className="mp-grid">
                      <div className="pay-field">
                        <span className="pay-field-label">Bucket</span>
                        <select
                          value={bucket}
                          onChange={(e) => {
                            setBucket(e.target.value);
                            setUsed(String(usedFor(sub, e.target.value)));
                          }}
                        >
                          {buckets.map((b) => (
                            <option key={b} value={b}>
                              {b}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="pay-field">
                        <span className="pay-field-label">Used visits</span>
                        <input type="number" min="0" value={used} onChange={(e) => setUsed(e.target.value)} />
                      </div>
                    </div>
                  )}
                  {action === "refund" && (
                    <div className="pay-field">
                      <span className="pay-field-label">
                        Amount (QAR) <span className="pay-optional">(empty = everything refundable)</span>
                      </span>
                      <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
                    </div>
                  )}
                  <div className="pay-field">
                    <span className="pay-field-label">Reason (required)</span>
                    <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} />
                  </div>
                  {error && <p className="pay-error">{error}</p>}
                  <div className="confirmation-modal-actions">
                    <button className="confirmation-modal-cancel" onClick={() => setAction(null)} disabled={saving}>
                      Back
                    </button>
                    <button className="confirmation-modal-confirm" onClick={submit} disabled={saving}>
                      {saving ? "Saving…" : "Confirm"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default MembershipDetailModal;
