import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import PrimaryButton from "../../components/PrimaryButton.jsx";
import JobStatusPill from "../../components/JobStatusPill.jsx";
import {
  useAuditJobMutation,
  useGetJobHistoryQuery,
  useGetJobQuery,
  useListVendorsQuery,
  useReauditJobMutation,
  useUpdateFinanceMutation,
} from "../../store/portalApi";
import "./JobDetail.css";
import "../Jobs/Jobs.css";

const REAUDIT_REASON_MIN = 10;

const PAYMENT_METHOD_LABELS = {
  card: "Card",
  wallet: "Wallet",
  cash: "Cash",
  fawran: "Fawran",
};

const HISTORY_ACTION_LABELS = {
  update: "Edited",
  audit: "Audited",
  reaudit: "Re-audited",
  reopen: "Reopened",
};

function formatMoney(value) {
  const n = Number(value) || 0;
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Every job is identified by the Job ID the technician types in when completing
// it. Jobs completed before that field existed fall back to the tail of the _id.
function formatJobId(job) {
  const reference = String(job?.job_reference || "").trim();
  if (reference) return reference;
  const rawId = String(job?._id || "");
  return rawId ? `#${rawId.slice(-6)}` : "—";
}

function formatPaymentMethod(value) {
  const key = String(value || "").trim().toLowerCase();
  if (!key) return "—";
  return PAYMENT_METHOD_LABELS[key] || key.charAt(0).toUpperCase() + key.slice(1);
}

// vendor_id comes back raw or populated depending on which endpoint produced the
// row, so normalise both shapes to a plain string for the <select> value.
function vendorIdOf(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return String(value._id || "");
}

function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, refetch } = useGetJobQuery(id);
  const { data: vendorData } = useListVendorsQuery({ isActive: true });
  const { data: historyData, isLoading: historyLoading } =
    useGetJobHistoryQuery(id);
  const [updateFinance, { isLoading: saving }] = useUpdateFinanceMutation();
  const [auditJob, { isLoading: auditing }] = useAuditJobMutation();
  const [reauditJob, { isLoading: reauditing }] = useReauditJobMutation();

  const [repairCosts, setRepairCosts] = useState([]);
  const [extraCosts, setExtraCosts] = useState([
    { label: "", amount: 0, vendor_id: "" },
  ]);
  const [purchases, setPurchases] = useState([
    {
      _id: "",
      description: "",
      vendor_id: "",
      sku: "",
      quantity: 1,
      unit_cost: 0,
      receipt_ref: "",
      notes: "",
    },
  ]);
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  // An audited job stays read-only until the auditor explicitly starts a
  // re-audit; only then do the inputs unlock and the reason modal become
  // reachable.
  const [reauditMode, setReauditMode] = useState(false);
  const [reauditOpen, setReauditOpen] = useState(false);
  const [reauditReason, setReauditReason] = useState("");
  const [reauditError, setReauditError] = useState("");

  // The GET is refetched after every save (and again by tag invalidation). Without
  // these guards each new `data` reference reseeds the form and silently discards
  // whatever the auditor typed while those round trips were in flight.
  const seededJobRef = useRef(null);
  const unsavedRef = useRef(false);
  const editSeqRef = useRef(0);

  const markEdited = () => {
    unsavedRef.current = true;
    editSeqRef.current += 1;
  };

  const job = data?.job;
  const finance = data?.finance;
  const isAudited = finance?.status === "audited";
  const reauditCount = Number(finance?.reauditCount) || 0;
  const locked = isAudited && !reauditMode;
  const trimmedReason = reauditReason.trim();

  const seedFromData = useCallback((payload) => {
    setRepairCosts(
      (payload.repairs || []).map((r) => ({
        id: r._id,
        name: r.name || r.description || "Repair",
        qty: r.quantity || 1,
        cost: r.cost ?? 0,
      }))
    );
    setExtraCosts(
      payload.finance?.extraCosts?.length
        ? payload.finance.extraCosts.map((r) => ({
            label: r.label || "",
            amount: r.amount ?? 0,
            vendor_id: vendorIdOf(r.vendor_id || r.vendor),
          }))
        : [{ label: "", amount: 0, vendor_id: "" }]
    );
    setPurchases(
      payload.finance?.purchases?.length
        ? payload.finance.purchases.map((row) => ({
            _id: row._id || "",
            description: row.description || "",
            vendor_id: vendorIdOf(row.vendor_id || row.vendor),
            sku: row.sku || "",
            quantity: row.quantity ?? 1,
            unit_cost: row.unit_cost ?? 0,
            receipt_ref: row.receipt_ref || "",
            notes: row.notes || "",
          }))
        : [
            {
              _id: "",
              description: "",
              vendor_id: "",
              sku: "",
              quantity: 1,
              unit_cost: 0,
              receipt_ref: "",
              notes: "",
            },
          ]
    );
    setNotes(payload.finance?.notes || "");
  }, []);

  useEffect(() => {
    if (!data) return;
    if (seededJobRef.current === id && unsavedRef.current) return;
    seedFromData(data);
    seededJobRef.current = id;
    unsavedRef.current = false;
  }, [data, id, seedFromData]);

  // Navigating to another job must never carry an in-flight re-audit over.
  useEffect(() => {
    setReauditMode(false);
    setReauditOpen(false);
    setReauditReason("");
    setReauditError("");
    setMessage("");
  }, [id]);

  useEffect(() => {
    if (!reauditOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === "Escape" && !reauditing) setReauditOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [reauditOpen, reauditing]);

  // Only active vendors are selectable, but a cost row saved earlier can point at
  // a vendor that has since been deactivated — keep that one in the list so
  // re-saving the row does not silently drop the link.
  const vendorOptions = useMemo(() => {
    // Absence from the fetched list only implies "deactivated" once that list
    // has actually arrived; while the query is in flight the vendor's state is
    // simply unknown, so it must not be labelled inactive.
    const vendorsLoaded = Array.isArray(vendorData?.vendors);
    const list = (vendorData?.vendors || []).filter(
      (v) => v && v.isActive !== false
    );
    const seen = new Set(list.map((v) => String(v._id)));
    (finance?.extraCosts || []).forEach((row) => {
      const vendorId = vendorIdOf(row.vendor_id || row.vendor);
      if (!vendorId || seen.has(vendorId)) return;
      seen.add(vendorId);
      list.push({
        _id: vendorId,
        name: row.vendor?.name || "Unknown vendor",
        isActive: vendorsLoaded ? false : undefined,
      });
    });
    (finance?.purchases || []).forEach((row) => {
      const vendorId = vendorIdOf(row.vendor_id || row.vendor);
      if (!vendorId || seen.has(vendorId)) return;
      seen.add(vendorId);
      list.push({
        _id: vendorId,
        name: row.vendor?.name || "Unknown vendor",
        isActive: vendorsLoaded ? false : undefined,
      });
    });
    return list;
  }, [vendorData, finance?.extraCosts, finance?.purchases]);

  const history = historyData?.history || [];

  const preview = useMemo(() => {
    const repairTotal = repairCosts.reduce(
      (sum, r) => sum + (Number(r.cost) || 0) * (Number(r.qty) || 1),
      0
    );
    const extraTotal = extraCosts.reduce(
      (sum, r) => sum + (Number(r.amount) || 0),
      0
    );
    const purchaseTotal = purchases.reduce(
      (sum, r) =>
        sum + (Number(r.quantity) || 0) * (Number(r.unit_cost) || 0),
      0
    );
    const revenue = finance?.revenue ?? 0;
    const costTotal = repairTotal + extraTotal + purchaseTotal;
    return {
      revenue,
      costTotal,
      netProfit: revenue - costTotal,
      purchaseTotal,
    };
  }, [repairCosts, extraCosts, purchases, finance?.revenue]);

  const buildPayload = () => ({
    repairCosts: repairCosts.map((r) => ({ id: r.id, cost: r.cost })),
    extraCosts: extraCosts
      // Mirror the server's own emptiness rule (a row is dropped only when it
      // has no label, no amount AND no vendor) so a vendor-only row survives.
      .filter((r) => r.label || r.amount || r.vendor_id)
      .map((r) => ({
        label: r.label,
        amount: r.amount,
        vendor_id: r.vendor_id || null,
      })),
    purchases: purchases
      .filter((r) => r.description || r.vendor_id || r.quantity || r.unit_cost)
      .map((r) => ({
        ...(r._id ? { _id: r._id } : {}),
        description: r.description,
        vendor_id: r.vendor_id || null,
        sku: r.sku || "",
        quantity: Number(r.quantity) || 0,
        unit_cost: Number(r.unit_cost) || 0,
        receipt_ref: r.receipt_ref || "",
        notes: r.notes || "",
      })),
    notes,
  });

  const handleSave = async () => {
    setMessage("");
    const seqAtSave = editSeqRef.current;
    try {
      await updateFinance({ id, ...buildPayload() }).unwrap();
      setMessage("Saved.");
      // Only let the refetch reseed the form if nothing was typed while the save
      // was in flight — otherwise those edits would be thrown away.
      if (editSeqRef.current === seqAtSave) {
        unsavedRef.current = false;
      }
      refetch();
    } catch (err) {
      setMessage(err?.data?.message || "Save failed.");
    }
  };

  const handleAudit = async () => {
    setMessage("");
    if (!window.confirm("Mark this job as audited? Snapshots will be saved.")) {
      return;
    }
    try {
      await auditJob({ id, ...buildPayload() }).unwrap();
      setMessage("Job audited.");
      // The job is locked from here on, so the server snapshot is the truth.
      unsavedRef.current = false;
      refetch();
    } catch (err) {
      setMessage(err?.data?.message || "Audit failed.");
    }
  };

  const startReaudit = () => {
    setMessage("");
    setReauditError("");
    setReauditReason("");
    setReauditMode(true);
  };

  const cancelReaudit = () => {
    // Drop the unsaved edits and go back to the audited snapshot.
    if (data) seedFromData(data);
    unsavedRef.current = false;
    setReauditMode(false);
    setReauditOpen(false);
    setReauditReason("");
    setReauditError("");
    setMessage("");
  };

  const handleReaudit = async () => {
    const reason = reauditReason.trim();
    if (reason.length < REAUDIT_REASON_MIN) {
      setReauditError(
        `Please give a reason of at least ${REAUDIT_REASON_MIN} characters.`
      );
      return;
    }
    setReauditError("");
    setMessage("");
    try {
      await reauditJob({ id, reason, ...buildPayload() }).unwrap();
      setMessage("Re-audit saved.");
      // The job is locked again, so the server snapshot is the truth.
      unsavedRef.current = false;
      setReauditMode(false);
      setReauditOpen(false);
      setReauditReason("");
      refetch();
    } catch (err) {
      setReauditError(err?.data?.message || "Re-audit failed.");
    }
  };

  if (isLoading) {
    return <div className="job-detail-page">Loading…</div>;
  }

  if (!job) {
    return (
      <div className="job-detail-page">
        <p>Job not found.</p>
        <Link to="/jobs">Back to jobs</Link>
      </div>
    );
  }

  return (
    <div className="job-detail-page">
      <div className="job-detail-header">
        <button type="button" className="job-detail-back" onClick={() => navigate("/jobs")}>
          ← Jobs
        </button>
        <h1 className="job-detail-title">{formatJobId(job)}</h1>
        <span className={`job-detail-audit-pill ${isAudited ? "audited" : "pending"}`}>
          {isAudited ? "Audited" : "Not audited"}
        </span>
        {reauditCount > 0 && (
          <span className="job-detail-reaudit-pill">
            Re-audited ×{reauditCount}
          </span>
        )}
      </div>

      <div className="job-detail-grid">
        <section className="job-detail-card">
          <h2>Job info</h2>
          <dl className="job-detail-dl">
            <dt>Job ID</dt>
            <dd className="job-detail-job-id">{formatJobId(job)}</dd>
            <dt>Client name</dt>
            <dd>{job.clientName || "—"}</dd>
            <dt>Client phone</dt>
            <dd>{job.clientMobileNumber || "—"}</dd>
            <dt>Location</dt>
            <dd>{job.location || "—"}</dd>
            <dt>Issue</dt>
            <dd>{job.issue || "—"}</dd>
            <dt>Payment</dt>
            <dd>
              {job.payment_method ? (
                <span className="job-detail-payment-pill">
                  {formatPaymentMethod(job.payment_method)}
                </span>
              ) : (
                "—"
              )}
            </dd>
            <dt>Status</dt>
            <dd>
              <JobStatusPill status={job.job_status || "completed"} />
            </dd>
            <dt>Completed</dt>
            <dd>
              {job.completed_at
                ? new Date(job.completed_at).toLocaleString()
                : "—"}
            </dd>
            <dt>Technician</dt>
            <dd>
              {job.assignedTechnician
                ? `${job.assignedTechnician.firstName || ""} ${job.assignedTechnician.lastName || ""}`.trim()
                : job.legacyTechnicianName || "—"}
            </dd>
          </dl>
        </section>

        <section className="job-detail-card job-detail-finance">
          <h2>Finance</h2>
          <div className="job-detail-summary-row">
            <div>
              <span className="job-detail-summary-label">Revenue</span>
              <strong>QAR {formatMoney(preview.revenue)}</strong>
            </div>
            <div>
              <span className="job-detail-summary-label">Costs</span>
              <strong>QAR {formatMoney(preview.costTotal)}</strong>
            </div>
            <div>
              <span className="job-detail-summary-label">Net profit</span>
              <strong className="job-detail-profit">
                QAR {formatMoney(preview.netProfit)}
              </strong>
            </div>
          </div>

          {reauditMode && (
            <p className="job-detail-reaudit-banner">
              Re-audit in progress — adjust the costs below, then submit with a
              reason. The saved snapshot will be overwritten.
            </p>
          )}

          <h3>Repair costs</h3>
          <div className="job-detail-table-wrap">
            <table className="job-detail-table">
              <thead>
                <tr>
                  <th>Repair</th>
                  <th>Qty</th>
                  <th>Cost (unit)</th>
                </tr>
              </thead>
              <tbody>
                {repairCosts.map((row, idx) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td>{row.qty}</td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.cost}
                        disabled={locked}
                        onChange={(e) => {
                          markEdited();
                          const next = [...repairCosts];
                          next[idx] = { ...row, cost: e.target.value };
                          setRepairCosts(next);
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3>Vendor purchases</h3>
          <p className="job-detail-section-hint">
            Record parts and supplies bought from vendors (qty × unit cost).
          </p>
          <div className="job-detail-table-wrap">
            <table className="job-detail-table job-detail-purchase-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Vendor</th>
                  <th>Qty</th>
                  <th>Unit cost</th>
                  <th>Total</th>
                  <th>Receipt</th>
                  {!locked && purchases.length > 1 ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {purchases.map((row, idx) => {
                  const lineTotal =
                    (Number(row.quantity) || 0) * (Number(row.unit_cost) || 0);
                  return (
                    <tr key={row._id || `purchase-${idx}`}>
                      <td>
                        <input
                          type="text"
                          placeholder="Part / item"
                          value={row.description}
                          disabled={locked}
                          onChange={(e) => {
                            markEdited();
                            const next = [...purchases];
                            next[idx] = { ...row, description: e.target.value };
                            setPurchases(next);
                          }}
                        />
                      </td>
                      <td>
                        <select
                          value={row.vendor_id || ""}
                          disabled={locked}
                          aria-label="Vendor"
                          onChange={(e) => {
                            markEdited();
                            const next = [...purchases];
                            next[idx] = { ...row, vendor_id: e.target.value };
                            setPurchases(next);
                          }}
                        >
                          <option value="">Select…</option>
                          {vendorOptions.map((vendor) => (
                            <option key={vendor._id} value={vendor._id}>
                              {vendor.isActive === false
                                ? `${vendor.name} (inactive)`
                                : vendor.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0.01"
                          step="any"
                          value={row.quantity}
                          disabled={locked}
                          onChange={(e) => {
                            markEdited();
                            const next = [...purchases];
                            next[idx] = { ...row, quantity: e.target.value };
                            setPurchases(next);
                          }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.unit_cost}
                          disabled={locked}
                          onChange={(e) => {
                            markEdited();
                            const next = [...purchases];
                            next[idx] = { ...row, unit_cost: e.target.value };
                            setPurchases(next);
                          }}
                        />
                      </td>
                      <td className="job-detail-purchase-total">
                        QAR {formatMoney(lineTotal)}
                      </td>
                      <td>
                        <input
                          type="text"
                          placeholder="Invoice #"
                          value={row.receipt_ref}
                          disabled={locked}
                          onChange={(e) => {
                            markEdited();
                            const next = [...purchases];
                            next[idx] = { ...row, receipt_ref: e.target.value };
                            setPurchases(next);
                          }}
                        />
                      </td>
                      {!locked && purchases.length > 1 ? (
                        <td>
                          <button
                            type="button"
                            className="job-detail-remove"
                            onClick={() => {
                              markEdited();
                              setPurchases(purchases.filter((_, i) => i !== idx));
                            }}
                          >
                            Remove
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!locked && (
            <button
              type="button"
              className="job-detail-add-row"
              onClick={() => {
                markEdited();
                setPurchases([
                  ...purchases,
                  {
                    _id: "",
                    description: "",
                    vendor_id: "",
                    sku: "",
                    quantity: 1,
                    unit_cost: 0,
                    receipt_ref: "",
                    notes: "",
                  },
                ]);
              }}
            >
              + Add purchase
            </button>
          )}

          <h3>Extra costs</h3>
          {extraCosts.map((row, idx) => (
            <div key={idx} className="job-detail-extra-row">
              <input
                type="text"
                placeholder="Label"
                value={row.label}
                disabled={locked}
                onChange={(e) => {
                  markEdited();
                  const next = [...extraCosts];
                  next[idx] = { ...row, label: e.target.value };
                  setExtraCosts(next);
                }}
              />
              <select
                className="job-detail-vendor-select"
                aria-label="Vendor"
                value={row.vendor_id || ""}
                disabled={locked}
                onChange={(e) => {
                  markEdited();
                  const next = [...extraCosts];
                  next[idx] = { ...row, vendor_id: e.target.value };
                  setExtraCosts(next);
                }}
              >
                <option value="">No vendor</option>
                {vendorOptions.map((vendor) => (
                  <option key={vendor._id} value={vendor._id}>
                    {vendor.isActive === false
                      ? `${vendor.name} (inactive)`
                      : vendor.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Amount"
                value={row.amount}
                disabled={locked}
                onChange={(e) => {
                  markEdited();
                  const next = [...extraCosts];
                  next[idx] = { ...row, amount: e.target.value };
                  setExtraCosts(next);
                }}
              />
              {!locked && extraCosts.length > 1 && (
                <button
                  type="button"
                  className="job-detail-remove"
                  onClick={() => {
                    markEdited();
                    setExtraCosts(extraCosts.filter((_, i) => i !== idx));
                  }}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          {!locked && (
            <button
              type="button"
              className="job-detail-add-row"
              onClick={() => {
                markEdited();
                setExtraCosts([
                  ...extraCosts,
                  { label: "", amount: 0, vendor_id: "" },
                ]);
              }}
            >
              + Add cost row
            </button>
          )}

          <label className="job-detail-notes-label" htmlFor="finance-notes">
            Notes
          </label>
          <textarea
            id="finance-notes"
            className="job-detail-notes"
            rows={3}
            value={notes}
            disabled={locked}
            onChange={(e) => {
              markEdited();
              setNotes(e.target.value);
            }}
          />

          {message && <p className="job-detail-message">{message}</p>}

          {!isAudited && (
            <div className="job-detail-actions">
              <PrimaryButton onClick={handleSave} disabled={saving || auditing}>
                {saving ? "Saving…" : "Save"}
              </PrimaryButton>
              <PrimaryButton
                onClick={handleAudit}
                disabled={saving || auditing}
                style={{ background: "var(--color-approved)" }}
              >
                {auditing ? "Auditing…" : "Mark audited"}
              </PrimaryButton>
            </div>
          )}

          {isAudited && !reauditMode && (
            <div className="job-detail-actions">
              <PrimaryButton onClick={startReaudit} disabled={reauditing}>
                Re-audit
              </PrimaryButton>
            </div>
          )}

          {isAudited && reauditMode && (
            <div className="job-detail-actions">
              <PrimaryButton
                onClick={() => setReauditOpen(true)}
                disabled={reauditing}
              >
                Submit re-audit
              </PrimaryButton>
              <button
                type="button"
                className="job-detail-secondary-btn"
                onClick={cancelReaudit}
                disabled={reauditing}
              >
                Cancel
              </button>
            </div>
          )}

          {isAudited && finance?.snapshots && (
            <p className="job-detail-snapshot-note">
              Snapshots saved — revenue QAR {formatMoney(finance.snapshots.revenue)},
              net profit QAR {formatMoney(finance.snapshots.netProfit)}.
            </p>
          )}

          {isAudited && reauditCount > 0 && (
            <p className="job-detail-snapshot-note">
              Last re-audited{" "}
              {finance?.lastReauditedAt
                ? new Date(finance.lastReauditedAt).toLocaleString()
                : "—"}
              {finance?.lastReauditReason
                ? ` — ${finance.lastReauditReason}`
                : ""}
            </p>
          )}
        </section>

        <section className="job-detail-card">
          <h2>Audit history</h2>
          {historyLoading && (
            <p className="job-detail-history-empty">Loading…</p>
          )}
          {!historyLoading && history.length === 0 && (
            <p className="job-detail-history-empty">
              No finance activity recorded yet.
            </p>
          )}
          {history.length > 0 && (
            <ol className="job-detail-history">
              {history.map((entry, idx) => (
                <li key={entry._id || idx} className="job-detail-history-item">
                  <div className="job-detail-history-head">
                    <span
                      className={`job-detail-history-action ${entry.action || "update"}`}
                    >
                      {HISTORY_ACTION_LABELS[entry.action] || entry.action || "—"}
                    </span>
                    <span className="job-detail-history-at">
                      {entry.at ? new Date(entry.at).toLocaleString() : "—"}
                    </span>
                  </div>
                  <div className="job-detail-history-by">
                    {entry.finance_user_id?.name ||
                      entry.finance_user_id?.email ||
                      "Finance user"}
                  </div>
                  {entry.reason && (
                    <div className="job-detail-history-reason">
                      Reason: {entry.reason}
                    </div>
                  )}
                  {entry.finance_net_profit != null && (
                    <div className="job-detail-history-money">
                      Net profit QAR {formatMoney(entry.finance_net_profit)}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {reauditOpen && (
        <div
          className="job-detail-modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !reauditing) {
              setReauditOpen(false);
            }
          }}
        >
          <div
            className="job-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reaudit-title"
          >
            <h2 id="reaudit-title" className="job-detail-modal-title">
              Re-audit {formatJobId(job)}
            </h2>
            <p className="job-detail-modal-copy">
              The edited costs will overwrite the saved snapshot. A reason is
              required and is kept in the audit history.
            </p>
            <label className="job-detail-notes-label" htmlFor="reaudit-reason">
              Reason for re-audit
            </label>
            <textarea
              id="reaudit-reason"
              className="job-detail-notes"
              rows={4}
              autoFocus
              maxLength={1000}
              value={reauditReason}
              placeholder="Why is this job being re-audited?"
              onChange={(e) => {
                setReauditReason(e.target.value);
                if (reauditError) setReauditError("");
              }}
            />
            <p className="job-detail-modal-hint">
              {trimmedReason.length}/{REAUDIT_REASON_MIN} characters minimum
            </p>
            {reauditError && (
              <p className="job-detail-modal-error">{reauditError}</p>
            )}
            <div className="job-detail-modal-actions">
              <button
                type="button"
                className="job-detail-secondary-btn"
                onClick={() => setReauditOpen(false)}
                disabled={reauditing}
              >
                Cancel
              </button>
              <PrimaryButton
                width="170px"
                onClick={handleReaudit}
                disabled={reauditing || trimmedReason.length < REAUDIT_REASON_MIN}
              >
                {reauditing ? "Saving…" : "Confirm re-audit"}
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default JobDetail;
