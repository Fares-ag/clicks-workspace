import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import PrimaryButton from "../../components/PrimaryButton.jsx";
import {
  useCloseSettlementMutation,
  useDeleteSettlementMutation,
  useGetSettlementQuery,
  useLazyGetSettlementJobCandidatesQuery,
  useMeQuery,
  useReopenSettlementMutation,
  useUpdateSettlementMutation,
} from "../../store/portalApi";
import {
  ENTRY_TYPE_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
  computeSettlementTotals,
  formatMoney,
  formatPeriod,
  settlementGap,
  settlementTitle,
} from "./settlementMath";
import JobPicker from "./JobPicker.jsx";
import "./Settlements.css";

const REOPEN_REASON_MIN = 10;
const STALE_RE = /changed by someone else/i;

const HISTORY_LABELS = {
  create: "Created",
  close: "Closed",
  reopen: "Reopened",
};

let rowKeySeq = 0;
const nextRowKey = () => `row-${(rowKeySeq += 1)}`;

// Zero shows as an empty field (placeholder "0") so untouched columns stay quiet.
const moneyField = (value) => (Number(value) ? String(value) : "");
const toNumber = (value) => (value === "" || value === null || value === undefined ? 0 : Number(value));

const blankJob = () => ({
  key: nextRowKey(),
  job_id: "",
  label: "",
  client_name: "",
  payment_method: "cash",
  amount: "",
  battery_cost: "",
  garage_cost: "",
  tip: "",
});

// A job picked or imported from the system: amount and payment method come
// from the job; battery, garage and tip are for the accountant to fill in.
const lineFromCandidate = (job) => ({
  ...blankJob(),
  job_id: String(job.job_id),
  label: job.label,
  client_name: job.client_name || "",
  payment_method: job.payment_method,
  amount: moneyField(job.amount),
});

const addedMessage = (count) =>
  `Added ${count} job${count === 1 ? "" : "s"}. Fill in battery, garage and tip where they apply, then save.`;

const blankEntry = () => ({
  key: nextRowKey(),
  type: "fawran_from_company",
  amount: "",
  date: "",
  note: "",
});

function formFromSettlement(settlement) {
  return {
    period_from: settlement.period_from || "",
    period_to: settlement.period_to || "",
    notes: settlement.notes || "",
    jobs: (settlement.jobs || []).map((line) => ({
      key: nextRowKey(),
      job_id: line.job_id ? String(line.job_id) : "",
      label: line.label || "",
      client_name: line.client_name || "",
      payment_method: line.payment_method || "cash",
      amount: moneyField(line.amount),
      battery_cost: moneyField(line.battery_cost),
      garage_cost: moneyField(line.garage_cost),
      tip: moneyField(line.tip),
    })),
    entries: (settlement.entries || []).map((entry) => ({
      key: nextRowKey(),
      type: entry.type,
      amount: moneyField(entry.amount),
      date: entry.date || "",
      note: entry.note || "",
    })),
  };
}

function buildPayload(form, revision) {
  return {
    revision,
    period_from: form.period_from,
    period_to: form.period_to,
    notes: form.notes,
    jobs: form.jobs.map((row) => ({
      job_id: row.job_id || null,
      label: row.label.trim(),
      payment_method: row.payment_method,
      amount: toNumber(row.amount),
      battery_cost: toNumber(row.battery_cost),
      garage_cost: toNumber(row.garage_cost),
      tip: toNumber(row.tip),
    })),
    entries: form.entries.map((row) => ({
      type: row.type,
      amount: toNumber(row.amount),
      date: row.date,
      note: row.note.trim(),
    })),
  };
}

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Qatar",
  });
}

function MoneyInput({ value, onChange, disabled, label }) {
  return (
    <input
      type="number"
      min="0"
      step="0.01"
      inputMode="decimal"
      placeholder="0"
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function SummaryRow({ label, value, sub, strong = false, tone = "" }) {
  const quiet = !strong && !Number(value);
  return (
    <div className={`settlement-sum-row${strong ? " strong" : ""}${quiet ? " quiet" : ""}`}>
      <span className="settlement-sum-label">
        {label}
        {sub ? <small>{sub}</small> : null}
      </span>
      <span className={`settlement-sum-value${tone ? ` ${tone}` : ""}`}>{formatMoney(value)}</span>
    </div>
  );
}

/** The spreadsheet's right-hand block: owed, credits, cash to collect, battery stock, gap. */
function SettlementSummary({ totals, collected }) {
  const gap = settlementGap(totals.cash_to_collect, collected);
  const restocked = totals.battery_restock_cash + totals.battery_restock_fawran;
  const fawranSplit =
    totals.customer_fawran && totals.fawran_handover
      ? `customers ${formatMoney(totals.customer_fawran)} · handovers ${formatMoney(totals.fawran_handover)}`
      : "";

  return (
    <section className="settlement-card settlement-summary">
      <h2>Summary</h2>

      <h3>Owed by technician</h3>
      <SummaryRow label="Job GP" value={totals.job_gp} />
      <SummaryRow label="Tips paid by customers" value={totals.tips_received} />
      <SummaryRow label="Batteries sold from van" value={totals.batteries_sold} />
      <SummaryRow label="Garage — cash jobs" value={totals.garage_cash_jobs} />
      <SummaryRow label="Garage — Fawran / card jobs" value={totals.garage_non_cash_jobs} />
      <SummaryRow
        label="Fawran sent by company"
        sub={
          totals.battery_restock_fawran
            ? `less ${formatMoney(totals.battery_restock_fawran)} spent on battery restock`
            : ""
        }
        value={totals.fawran_from_company_net}
      />
      <SummaryRow label="Total owed" value={totals.owed_total} strong />

      <h3>Credits</h3>
      <SummaryRow label="Fawran received by company" sub={fawranSplit} value={totals.fawran_received} />
      <SummaryRow label="Card / wallet paid to company" value={totals.card_wallet_received} />
      <SummaryRow label="Battery restock — cash" value={totals.battery_restock_cash} />
      <SummaryRow label="Petrol" value={totals.petrol} />
      <SummaryRow label="Work expenses — cash" value={totals.work_expense_cash} />
      <SummaryRow label="Work expenses — Fawran" value={totals.work_expense_fawran} />
      <SummaryRow label="Tips kept by technician" value={totals.tips_kept} />
      <SummaryRow label="Total credits" value={totals.credits_total} strong />

      <div className="settlement-cash-box">
        <span>Cash to collect</span>
        <strong>QAR {formatMoney(totals.cash_to_collect)}</strong>
        {totals.cash_to_collect < 0 && <small>Negative: the company owes the technician.</small>}
      </div>

      <h3>Battery stock</h3>
      <SummaryRow label="Batteries sold (cost)" value={totals.batteries_sold} />
      <SummaryRow label="Batteries restocked" value={restocked} />
      <SummaryRow label="Battery gap" sub="Sold minus restocked" value={totals.battery_gap} />
      <SummaryRow
        label="Cash to collect after battery gap"
        sub="For information only"
        value={totals.net_after_battery_gap}
      />

      {gap !== null && (
        <>
          <h3>Collection</h3>
          <SummaryRow label="Collected" value={collected} />
          <SummaryRow
            label={gap < 0 ? "Gap — short" : gap > 0 ? "Gap — over" : "Gap"}
            value={gap}
            tone={gap < 0 ? "short" : gap > 0 ? "over" : ""}
            strong
          />
        </>
      )}
    </section>
  );
}

function SettlementDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, refetch } = useGetSettlementQuery(id);
  const { data: meData } = useMeQuery();
  const [updateSettlement, { isLoading: saving }] = useUpdateSettlementMutation();
  const [closeSettlement, { isLoading: closing }] = useCloseSettlementMutation();
  const [reopenSettlement, { isLoading: reopening }] = useReopenSettlementMutation();
  const [deleteSettlement, { isLoading: deleting }] = useDeleteSettlementMutation();
  const [fetchCandidates, { isFetching: importing }] = useLazyGetSettlementJobCandidatesQuery();

  const settlement = data?.settlement;
  const [form, setForm] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [closeOpen, setCloseOpen] = useState(false);
  const [collectedInput, setCollectedInput] = useState("");
  const [closeError, setCloseError] = useState("");
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [reopenError, setReopenError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  // The settlement and revision the form was filled from. The revision goes
  // back with every save, so a save can never overwrite someone else's edits.
  const seededRef = useRef({ id: null, revision: null });

  const seed = (next) => {
    seededRef.current = { id: String(next._id), revision: next.revision };
    setForm(formFromSettlement(next));
    setDirty(false);
  };

  // Refetches (tag invalidation, window refocus) refill the form only while
  // nothing is unsaved, so typing is never thrown away.
  useEffect(() => {
    if (!settlement) return;
    const sameDoc = seededRef.current.id === String(settlement._id);
    if (sameDoc && (dirty || settlement.revision === seededRef.current.revision)) return;
    seed(settlement);
  }, [settlement]);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const totals = useMemo(
    () => (form ? computeSettlementTotals(form.jobs, form.entries) : null),
    [form]
  );

  if (isLoading) return <div className="settlement-page">Loading…</div>;
  if (!settlement) {
    return (
      <div className="settlement-page">
        <p>Settlement not found.</p>
        <Link to="/settlements">Back to settlements</Link>
      </div>
    );
  }
  if (!form || !totals) return <div className="settlement-page">Loading…</div>;

  const locked = settlement.status === "closed";
  const isAdmin = meData?.user?.role === "admin";
  const busy = saving || closing || reopening || deleting;
  const stale = STALE_RE.test(error);
  const closeGap = settlementGap(totals.cash_to_collect, collectedInput);

  const edit = (updater) => {
    setForm((current) => updater(current));
    setDirty(true);
    setMessage("");
  };
  const updateJob = (key, patch) =>
    edit((current) => ({
      ...current,
      jobs: current.jobs.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    }));
  const updateEntry = (key, patch) =>
    edit((current) => ({
      ...current,
      entries: current.entries.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    }));

  const handleImport = async () => {
    setError("");
    setMessage("");
    try {
      const res = await fetchCandidates({
        id,
        from: form.period_from,
        to: form.period_to,
      }).unwrap();
      const present = new Set(form.jobs.map((row) => row.job_id).filter(Boolean));
      const fresh = [];
      const elsewhere = new Set();
      for (const job of res.jobs || []) {
        if (present.has(String(job.job_id))) continue;
        if (job.settlement) {
          elsewhere.add(`#${job.settlement.number}`);
          continue;
        }
        fresh.push(lineFromCandidate(job));
      }
      if (fresh.length) {
        edit((current) => ({ ...current, jobs: [...current.jobs, ...fresh] }));
      }
      const parts = [
        fresh.length ? addedMessage(fresh.length) : "No new completed jobs to add for this period.",
      ];
      if (elsewhere.size) {
        parts.push(`Skipped jobs already in settlement ${[...elsewhere].join(", ")}.`);
      }
      setMessage(parts.join(" "));
    } catch (err) {
      setError(err?.data?.message || "Could not load the technician's jobs.");
    }
  };

  const handlePickJobs = (picked) => {
    const present = new Set(form.jobs.map((row) => row.job_id).filter(Boolean));
    const fresh = picked
      .filter((job) => !present.has(String(job.job_id)))
      .map(lineFromCandidate);
    setPickerOpen(false);
    setError("");
    if (!fresh.length) return;
    edit((current) => ({ ...current, jobs: [...current.jobs, ...fresh] }));
    setMessage(addedMessage(fresh.length));
  };

  const addJobByHand = () =>
    edit((current) => ({ ...current, jobs: [...current.jobs, blankJob()] }));

  const handleSave = async () => {
    setError("");
    setMessage("");
    try {
      const res = await updateSettlement({
        id,
        ...buildPayload(form, seededRef.current.revision),
      }).unwrap();
      seed(res.settlement);
      setMessage("Saved.");
    } catch (err) {
      setError(err?.data?.message || "Could not save the settlement.");
    }
  };

  const handleReload = async () => {
    setError("");
    const result = await refetch();
    if (result.data?.settlement) seed(result.data.settlement);
  };

  const openClose = () => {
    const previous = settlement.collected_amount;
    setCollectedInput(previous === null || previous === undefined ? "" : String(previous));
    setCloseError("");
    setCloseOpen(true);
  };

  const handleClose = async (e) => {
    e.preventDefault();
    if (collectedInput === "" || !Number.isFinite(Number(collectedInput))) {
      setCloseError("Enter the cash you collected.");
      return;
    }
    setCloseError("");
    try {
      const res = await closeSettlement({
        id,
        ...buildPayload(form, seededRef.current.revision),
        collected_amount: Number(collectedInput),
      }).unwrap();
      seed(res.settlement);
      setCloseOpen(false);
      setMessage("Settlement closed.");
    } catch (err) {
      setCloseError(err?.data?.message || "Could not close the settlement.");
    }
  };

  const handleReopen = async (e) => {
    e.preventDefault();
    const reason = reopenReason.trim();
    if (reason.length < REOPEN_REASON_MIN) {
      setReopenError(`Give a reason of at least ${REOPEN_REASON_MIN} characters.`);
      return;
    }
    setReopenError("");
    try {
      const res = await reopenSettlement({ id, reason }).unwrap();
      seed(res.settlement);
      setReopenOpen(false);
      setReopenReason("");
      setMessage("Reopened — the settlement can be edited again.");
    } catch (err) {
      setReopenError(err?.data?.message || "Could not reopen the settlement.");
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Delete this draft settlement? This cannot be undone.")) return;
    try {
      await deleteSettlement(id).unwrap();
      navigate("/settlements");
    } catch (err) {
      setError(err?.data?.message || "Could not delete the settlement.");
    }
  };

  return (
    <div className="settlement-page">
      <div className="settlement-header">
        <button type="button" className="settlement-back" onClick={() => navigate("/settlements")}>
          ← Settlements
        </button>
        <h1 className="settlement-title">{settlementTitle(settlement)}</h1>
        <span className={`settlement-status-pill ${settlement.status}`}>
          {locked ? "Closed" : "Draft"}
        </span>
        <span className="settlement-period-label">
          {formatPeriod(settlement.period_from, settlement.period_to)}
        </span>
        {dirty && <span className="settlement-unsaved">Unsaved changes</span>}
      </div>

      <div className="settlement-grid">
        <div className="settlement-main">
          <section className="settlement-card">
            <h2>Period</h2>
            <div className="settlement-period-row">
              <label className="settlement-field">
                <span>From</span>
                <input
                  type="date"
                  value={form.period_from}
                  disabled={locked}
                  onChange={(e) => edit((current) => ({ ...current, period_from: e.target.value }))}
                />
              </label>
              <label className="settlement-field">
                <span>To</span>
                <input
                  type="date"
                  value={form.period_to}
                  disabled={locked}
                  onChange={(e) => edit((current) => ({ ...current, period_to: e.target.value }))}
                />
              </label>
            </div>
            <label className="settlement-field settlement-field--full">
              <span>Notes</span>
              <textarea
                rows={2}
                value={form.notes}
                disabled={locked}
                onChange={(e) => edit((current) => ({ ...current, notes: e.target.value }))}
              />
            </label>
          </section>

          <section className="settlement-card">
            <div className="settlement-card-head">
              <h2>
                Jobs <span className="settlement-count">{form.jobs.length}</span>
              </h2>
              {!locked && (
                <div className="settlement-card-actions">
                  <button
                    type="button"
                    className="settlement-secondary-btn"
                    onClick={() => setPickerOpen(true)}
                    disabled={busy}
                  >
                    + Select jobs
                  </button>
                  <button
                    type="button"
                    className="settlement-secondary-btn"
                    onClick={handleImport}
                    disabled={importing || busy}
                  >
                    {importing ? "Loading jobs…" : "Import all for this period"}
                  </button>
                  <button type="button" className="settlement-link-btn" onClick={addJobByHand}>
                    + Add by hand
                  </button>
                </div>
              )}
            </div>
            <p className="settlement-hint">
              Amount is what the customer paid for the job, without the tip. Battery and garage are
              the parts of that amount that paid for a battery from the van and for the garage's
              invoice. GP is what is left.
            </p>
            <div className="settlement-table-wrap">
              <table className="settlement-table">
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Paid by</th>
                    <th className="num">Amount</th>
                    <th className="num">Battery</th>
                    <th className="num">Garage</th>
                    <th className="num">Tip</th>
                    <th className="num">GP</th>
                    {!locked && <th aria-label="Actions" />}
                  </tr>
                </thead>
                <tbody>
                  {form.jobs.length === 0 && (
                    <tr>
                      <td colSpan={8} className="settlement-empty">
                        No jobs yet. Select jobs from the system, import all of this period's
                        completed jobs, or add one by hand.
                      </td>
                    </tr>
                  )}
                  {form.jobs.map((row) => {
                    const gp =
                      toNumber(row.amount) - toNumber(row.battery_cost) - toNumber(row.garage_cost);
                    return (
                      <tr key={row.key}>
                        <td className="settlement-job-cell">
                          {row.job_id ? (
                            <>
                              <Link to={`/jobs/${row.job_id}`}>{row.label || "Job"}</Link>
                              {row.client_name && <span>{row.client_name}</span>}
                            </>
                          ) : (
                            <input
                              type="text"
                              placeholder="Description"
                              aria-label="Job description"
                              value={row.label}
                              disabled={locked}
                              onChange={(e) => updateJob(row.key, { label: e.target.value })}
                            />
                          )}
                        </td>
                        <td>
                          <select
                            aria-label="Paid by"
                            value={row.payment_method}
                            disabled={locked}
                            onChange={(e) => updateJob(row.key, { payment_method: e.target.value })}
                          >
                            {PAYMENT_METHOD_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <MoneyInput
                            label="Amount"
                            value={row.amount}
                            disabled={locked}
                            onChange={(value) => updateJob(row.key, { amount: value })}
                          />
                        </td>
                        <td>
                          <MoneyInput
                            label="Battery cost"
                            value={row.battery_cost}
                            disabled={locked}
                            onChange={(value) => updateJob(row.key, { battery_cost: value })}
                          />
                        </td>
                        <td>
                          <MoneyInput
                            label="Garage cost"
                            value={row.garage_cost}
                            disabled={locked}
                            onChange={(value) => updateJob(row.key, { garage_cost: value })}
                          />
                        </td>
                        <td>
                          <MoneyInput
                            label="Tip"
                            value={row.tip}
                            disabled={locked}
                            onChange={(value) => updateJob(row.key, { tip: value })}
                          />
                        </td>
                        <td className={`num settlement-gp${gp < 0 ? " negative" : ""}`}>
                          {formatMoney(gp)}
                        </td>
                        {!locked && (
                          <td>
                            <button
                              type="button"
                              className="settlement-remove"
                              aria-label="Remove job"
                              title="Remove job"
                              onClick={() =>
                                edit((current) => ({
                                  ...current,
                                  jobs: current.jobs.filter((line) => line.key !== row.key),
                                }))
                              }
                            >
                              ×
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="settlement-card">
            <div className="settlement-card-head">
              <h2>
                Money movements <span className="settlement-count">{form.entries.length}</span>
              </h2>
              {!locked && (
                <div className="settlement-card-actions">
                  <button
                    type="button"
                    className="settlement-link-btn"
                    onClick={() =>
                      edit((current) => ({ ...current, entries: [...current.entries, blankEntry()] }))
                    }
                  >
                    + Add entry
                  </button>
                </div>
              )}
            </div>
            <p className="settlement-hint">
              Money that moved outside a job. "Fawran sent by company" is money the company sent the
              technician; "Fawran sent to company" is collected cash the technician transferred in.
            </p>
            <div className="settlement-table-wrap">
              <table className="settlement-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th className="num">Amount</th>
                    <th>Date</th>
                    <th>Note</th>
                    {!locked && <th aria-label="Actions" />}
                  </tr>
                </thead>
                <tbody>
                  {form.entries.length === 0 && (
                    <tr>
                      <td colSpan={5} className="settlement-empty">
                        No money movements yet.
                      </td>
                    </tr>
                  )}
                  {form.entries.map((row) => (
                    <tr key={row.key}>
                      <td>
                        <select
                          className="settlement-entry-type"
                          aria-label="Entry type"
                          value={row.type}
                          disabled={locked}
                          onChange={(e) => updateEntry(row.key, { type: e.target.value })}
                        >
                          {ENTRY_TYPE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <MoneyInput
                          label="Amount"
                          value={row.amount}
                          disabled={locked}
                          onChange={(value) => updateEntry(row.key, { amount: value })}
                        />
                      </td>
                      <td>
                        <input
                          type="date"
                          aria-label="Date"
                          value={row.date}
                          disabled={locked}
                          onChange={(e) => updateEntry(row.key, { date: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          placeholder="Optional"
                          aria-label="Note"
                          value={row.note}
                          disabled={locked}
                          onChange={(e) => updateEntry(row.key, { note: e.target.value })}
                        />
                      </td>
                      {!locked && (
                        <td>
                          <button
                            type="button"
                            className="settlement-remove"
                            aria-label="Remove entry"
                            title="Remove entry"
                            onClick={() =>
                              edit((current) => ({
                                ...current,
                                entries: current.entries.filter((line) => line.key !== row.key),
                              }))
                            }
                          >
                            ×
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="settlement-card">
            <h2>History</h2>
            <ul className="settlement-history">
              {[...(settlement.history || [])].reverse().map((row, idx) => (
                <li key={`${row.action}-${row.at}-${idx}`}>
                  <div className="settlement-history-head">
                    <span className={`settlement-history-action ${row.action}`}>
                      {HISTORY_LABELS[row.action] || row.action}
                    </span>
                    <span className="settlement-history-at">{formatDateTime(row.at)}</span>
                    {row.by && <span className="settlement-history-by">by {row.by}</span>}
                  </div>
                  {row.action === "close" && (
                    <div className="settlement-history-money">
                      Cash to collect QAR {formatMoney(row.cash_to_collect)} · collected QAR{" "}
                      {formatMoney(row.collected)}
                    </div>
                  )}
                  {row.reason && <p className="settlement-history-reason">{row.reason}</p>}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="settlement-side">
          <SettlementSummary totals={totals} collected={settlement.collected_amount} />

          <div className="settlement-actions">
            {!locked && (
              <>
                <PrimaryButton onClick={handleSave} disabled={busy || !dirty}>
                  {saving ? "Saving…" : "Save"}
                </PrimaryButton>
                <PrimaryButton
                  onClick={openClose}
                  disabled={busy}
                  style={{ background: "var(--color-approved)" }}
                >
                  Close settlement
                </PrimaryButton>
                {dirty && (
                  <button
                    type="button"
                    className="settlement-secondary-btn"
                    onClick={() => seed(settlement)}
                    disabled={busy}
                  >
                    Discard changes
                  </button>
                )}
                <button
                  type="button"
                  className="settlement-danger-btn"
                  onClick={handleDelete}
                  disabled={busy}
                >
                  Delete draft
                </button>
              </>
            )}
            {locked && isAdmin && (
              <PrimaryButton
                onClick={() => {
                  setReopenError("");
                  setReopenOpen(true);
                }}
                disabled={busy}
              >
                Reopen
              </PrimaryButton>
            )}
          </div>
          {locked && (
            <p className="settlement-hint">
              Closed {formatDateTime(settlement.closed_at)}
              {settlement.closed_by ? ` by ${settlement.closed_by}` : ""}.
              {!isAdmin && " Closed settlements are locked; a finance admin can reopen one."}
            </p>
          )}
          {message && <p className="settlement-message">{message}</p>}
          {error && (
            <div className="settlement-error">
              <span>{error}</span>
              {stale && (
                <button type="button" className="settlement-link-btn" onClick={handleReload}>
                  Reload latest (discards your changes)
                </button>
              )}
            </div>
          )}
        </aside>
      </div>

      {pickerOpen && (
        <JobPicker
          settlementId={id}
          periodFrom={form.period_from}
          periodTo={form.period_to}
          addedJobIds={new Set(form.jobs.map((row) => row.job_id).filter(Boolean))}
          onAdd={handlePickJobs}
          onAddByHand={() => {
            setPickerOpen(false);
            addJobByHand();
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {closeOpen && (
        <div className="settlement-modal-backdrop" onClick={() => !closing && setCloseOpen(false)}>
          <form
            className="settlement-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleClose}
            aria-labelledby="close-settlement-title"
          >
            <h2 id="close-settlement-title" className="settlement-modal-title">
              Close settlement
            </h2>
            <p className="settlement-modal-copy">
              Cash to collect: <strong>QAR {formatMoney(totals.cash_to_collect)}</strong>
            </p>
            <div className="settlement-form-group">
              <label htmlFor="settlement-collected">Cash collected (QAR)</label>
              <input
                id="settlement-collected"
                type="number"
                step="0.01"
                inputMode="decimal"
                value={collectedInput}
                onChange={(e) => setCollectedInput(e.target.value)}
                autoFocus
              />
            </div>
            <p className="settlement-form-hint">
              Enter a negative amount if you paid the technician instead.
            </p>
            {closeGap !== null && (
              <p
                className={`settlement-modal-gap ${
                  closeGap < 0 ? "short" : closeGap > 0 ? "over" : "even"
                }`}
              >
                {closeGap < 0
                  ? `Short by QAR ${formatMoney(-closeGap)}`
                  : closeGap > 0
                    ? `Over by QAR ${formatMoney(closeGap)}`
                    : "Matches exactly"}
              </p>
            )}
            <p className="settlement-form-hint">
              Closing saves your changes and locks the settlement.
            </p>
            {closeError && <p className="settlement-form-error">{closeError}</p>}
            <div className="settlement-modal-actions">
              <button
                type="button"
                className="settlement-secondary-btn"
                disabled={closing}
                onClick={() => setCloseOpen(false)}
              >
                Cancel
              </button>
              <PrimaryButton type="submit" disabled={closing}>
                {closing ? "Closing…" : "Close settlement"}
              </PrimaryButton>
            </div>
          </form>
        </div>
      )}

      {reopenOpen && (
        <div className="settlement-modal-backdrop" onClick={() => !reopening && setReopenOpen(false)}>
          <form
            className="settlement-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleReopen}
            aria-labelledby="reopen-settlement-title"
          >
            <h2 id="reopen-settlement-title" className="settlement-modal-title">
              Reopen settlement
            </h2>
            <p className="settlement-modal-copy">
              The cash was already collected. Say why this settlement needs to change; the reason
              is kept in its history.
            </p>
            <div className="settlement-form-group">
              <label htmlFor="settlement-reopen-reason">Reason</label>
              <textarea
                id="settlement-reopen-reason"
                rows={3}
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                autoFocus
              />
            </div>
            {reopenError && <p className="settlement-form-error">{reopenError}</p>}
            <div className="settlement-modal-actions">
              <button
                type="button"
                className="settlement-secondary-btn"
                disabled={reopening}
                onClick={() => setReopenOpen(false)}
              >
                Cancel
              </button>
              <PrimaryButton type="submit" disabled={reopening}>
                {reopening ? "Reopening…" : "Reopen"}
              </PrimaryButton>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default SettlementDetail;
