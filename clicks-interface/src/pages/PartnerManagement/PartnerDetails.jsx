import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  useGetPartnerQuery,
  useGetPartnerEarningsQuery,
  useGetPartnerWithdrawalsQuery,
  useStartPartnerNextPeriodMutation,
  useUpdatePartnerMutation,
  useUpdatePartnerWithdrawalMutation,
} from "../../store/partnerApi";
import "./Partners.css";

function toDateInputValue(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function withdrawalTypeLabel(type) {
  if (type === "investment") return "Investment";
  if (type === "both") return "Both";
  return "Earnings";
}

function PartnerDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, error } = useGetPartnerQuery(id);
  const { data: earningsData } = useGetPartnerEarningsQuery(id);
  const { data: withdrawalsData } = useGetPartnerWithdrawalsQuery(id);
  const [startNext, { isLoading: starting }] = useStartPartnerNextPeriodMutation();
  const [updatePartner, { isLoading: saving }] = useUpdatePartnerMutation();
  const [updateWithdrawal, { isLoading: updatingWithdrawal }] =
    useUpdatePartnerWithdrawalMutation();

  const partner = data?.partner;
  const earnings = earningsData?.earnings || [];
  const withdrawals = withdrawalsData?.withdrawals || [];

  const [terms, setTerms] = useState({
    investmentAmount: "",
    profitPerPeriod: "",
    currentPeriodCap: "",
    periodMonths: "",
    currentPeriod: "",
    periodStartedAt: "",
    periodEndsAt: "",
  });
  const [termsError, setTermsError] = useState("");
  const [termsSaved, setTermsSaved] = useState(false);

  useEffect(() => {
    if (!partner) return;
    setTerms({
      investmentAmount: String(partner.investmentAmount ?? ""),
      profitPerPeriod: String(partner.profitPerPeriod ?? ""),
      currentPeriodCap: String(partner.currentPeriodCap ?? partner.periodCap ?? ""),
      periodMonths: String(partner.periodMonths ?? 2),
      currentPeriod: String(partner.currentPeriod ?? 1),
      periodStartedAt: toDateInputValue(partner.periodStartedAt),
      periodEndsAt: toDateInputValue(partner.periodEndsAt),
    });
  }, [partner]);

  if (isLoading) {
    return <div className="partner-container">Loading…</div>;
  }
  if (error || !partner) {
    return <div className="partner-container">Partner not found</div>;
  }

  const pct = partner.periodCap
    ? Math.min(100, (Number(partner.accruedTotal || 0) / partner.periodCap) * 100)
    : 0;

  const canStartNext =
    partner.status === "capped" || partner.status === "frozen";

  const periodDatesLocked = Boolean(partner.periodStartedAt && partner.periodEndsAt);

  const suggestedNextCap =
    Number(partner.periodCap || 0) + Number(partner.profitPerPeriod || 0);

  const handleNext = async () => {
    const input = window.prompt(
      `Start next period. Set the new period cap (QAR).\nSuggested ladder: ${suggestedNextCap}`,
      String(suggestedNextCap)
    );
    if (input === null) return;
    const cap = Number(input);
    if (Number.isNaN(cap) || cap < 0) {
      alert("Enter a valid non-negative cap");
      return;
    }
    const monthsInput = window.prompt(
      `Period length in months for the next period (partner-specific).`,
      String(partner.periodMonths || 2)
    );
    if (monthsInput === null) return;
    const periodMonths = Number(monthsInput);
    if (!Number.isInteger(periodMonths) || periodMonths < 1) {
      alert("Period length must be a whole number >= 1");
      return;
    }
    try {
      await startNext({ id, currentPeriodCap: cap, periodMonths }).unwrap();
    } catch (err) {
      alert(err?.data?.message || "Failed to start next period");
    }
  };

  const handleWithdrawalStatus = async (withdrawalId, status) => {
    let adminNote = "";
    if (status === "rejected" || status === "paid") {
      const note = window.prompt(
        status === "paid"
          ? "Optional admin note (cash settlement)"
          : "Optional rejection note",
        ""
      );
      if (note === null) return;
      adminNote = note;
    }
    try {
      await updateWithdrawal({
        id,
        withdrawalId,
        status,
        adminNote: adminNote || undefined,
      }).unwrap();
    } catch (err) {
      alert(err?.data?.message || "Failed to update withdrawal");
    }
  };

  const onTermsChange = (field) => (e) => {
    const value = e.target.value;
    setTerms((prev) => {
      const next = { ...prev, [field]: value };
      if (
        !periodDatesLocked &&
        (field === "periodMonths" || field === "periodStartedAt")
      ) {
        const start = new Date(
          field === "periodStartedAt" ? value : next.periodStartedAt
        );
        const months = Number(
          field === "periodMonths" ? value : next.periodMonths
        );
        if (!Number.isNaN(start.getTime()) && Number.isInteger(months) && months >= 1) {
          const end = new Date(start);
          end.setMonth(end.getMonth() + months);
          next.periodEndsAt = toDateInputValue(end);
        }
      }
      return next;
    });
    setTermsSaved(false);
    setTermsError("");
  };

  const applyFormulaCap = () => {
    const inv = Number(terms.investmentAmount);
    const profit = Number(terms.profitPerPeriod);
    const period = Number(terms.currentPeriod || partner.currentPeriod || 1);
    if (Number.isNaN(inv) || Number.isNaN(profit)) return;
    setTerms((prev) => ({
      ...prev,
      currentPeriodCap: String(inv + period * profit),
    }));
    setTermsSaved(false);
  };

  const handleSaveTerms = async (e) => {
    e.preventDefault();
    setTermsError("");
    setTermsSaved(false);
    const payload = {
      id,
      investmentAmount: Number(terms.investmentAmount),
      profitPerPeriod: Number(terms.profitPerPeriod),
      currentPeriodCap: Number(terms.currentPeriodCap),
      periodMonths: Number(terms.periodMonths),
      currentPeriod: Number(terms.currentPeriod),
    };
    if (!periodDatesLocked) {
      payload.periodStartedAt = terms.periodStartedAt
        ? new Date(`${terms.periodStartedAt}T00:00:00`).toISOString()
        : undefined;
      payload.periodEndsAt = terms.periodEndsAt
        ? new Date(`${terms.periodEndsAt}T23:59:59`).toISOString()
        : undefined;
      payload.recalculatePeriodEnd = false;
    }
    const numericFields = [
      payload.investmentAmount,
      payload.profitPerPeriod,
      payload.currentPeriodCap,
      payload.periodMonths,
      payload.currentPeriod,
    ];
    if (numericFields.some((n) => Number.isNaN(n) || n < 0)) {
      setTermsError("All amounts must be valid non-negative numbers");
      return;
    }
    if (!Number.isInteger(payload.periodMonths) || payload.periodMonths < 1) {
      setTermsError("Period length must be a whole number >= 1");
      return;
    }
    if (!Number.isInteger(payload.currentPeriod) || payload.currentPeriod < 1) {
      setTermsError("Current period # must be a whole number >= 1");
      return;
    }
    try {
      await updatePartner(payload).unwrap();
      setTermsSaved(true);
    } catch (err) {
      setTermsError(err?.data?.message || "Failed to save terms");
    }
  };

  return (
    <div className="partner-container">
      <div className="partner-header-row">
        <div>
          <button
            type="button"
            className="partner-back"
            onClick={() => navigate("/partners")}
          >
            ← Back
          </button>
          <h1 className="partner-title">{partner.name}</h1>
          <p className="partner-subtitle">
            Period #{partner.currentPeriod} · {partner.status} ·{" "}
            {partner.daysLeft} days left
            {partner.periodEndsAt
              ? ` · ends ${new Date(partner.periodEndsAt).toLocaleDateString()}`
              : ""}
          </p>
        </div>
        {canStartNext && (
          <button
            type="button"
            className="partner-add-btn"
            disabled={starting}
            onClick={handleNext}
          >
            {starting ? "Starting…" : "Start next period"}
          </button>
        )}
      </div>

      <div className="partner-stats">
        <div className="partner-stat-card">
          <div className="partner-stat-label">Investment</div>
          <div className="partner-stat-value">
            QAR {Number(partner.investmentAmount || 0).toLocaleString()}
          </div>
        </div>
        <div className="partner-stat-card">
          <div className="partner-stat-label">Accrued</div>
          <div className="partner-stat-value">
            QAR {Number(partner.accruedTotal || 0).toLocaleString()}
          </div>
        </div>
        <div className="partner-stat-card">
          <div className="partner-stat-label">Period cap</div>
          <div className="partner-stat-value">
            QAR {Number(partner.periodCap || 0).toLocaleString()}
          </div>
        </div>
        <div className="partner-stat-card">
          <div className="partner-stat-label">Remaining</div>
          <div className="partner-stat-value">
            QAR {Number(partner.remainingToCap || 0).toLocaleString()}
          </div>
        </div>
      </div>

      <div className="partner-progress-wrap">
        <div className="partner-progress-bar">
          <div className="partner-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="partner-muted">{pct.toFixed(0)}% of period cap</div>
      </div>

      <h2 className="partner-section-title">Cap &amp; period terms (admin)</h2>
      <p className="partner-muted" style={{ marginBottom: 12 }}>
        Each partner can have different cap and period length.
        {periodDatesLocked
          ? " Period start and end dates are fixed once set — use Start next period to begin a new period with new dates."
          : " Changing start or length updates the end date preview; you can override the end date before saving."}
      </p>
      <form className="partner-terms-form" onSubmit={handleSaveTerms}>
        <label>
          Investment (QAR)
          <input
            type="number"
            min={0}
            step="1"
            value={terms.investmentAmount}
            onChange={onTermsChange("investmentAmount")}
          />
        </label>
        <label>
          Profit per period (QAR)
          <input
            type="number"
            min={0}
            step="1"
            value={terms.profitPerPeriod}
            onChange={onTermsChange("profitPerPeriod")}
          />
        </label>
        <label>
          Current period cap (QAR)
          <input
            type="number"
            min={0}
            step="1"
            value={terms.currentPeriodCap}
            onChange={onTermsChange("currentPeriodCap")}
          />
        </label>
        <label>
          Period length (months)
          <input
            type="number"
            min={1}
            step="1"
            value={terms.periodMonths}
            onChange={onTermsChange("periodMonths")}
          />
        </label>
        <label>
          Current period #
          <input
            type="number"
            min={1}
            step="1"
            value={terms.currentPeriod}
            onChange={onTermsChange("currentPeriod")}
          />
        </label>
        <label>
          Period start
          {periodDatesLocked ? (
            <span className="partner-readonly-date">
              {partner.periodStartedAt
                ? new Date(partner.periodStartedAt).toLocaleDateString()
                : "—"}
            </span>
          ) : (
            <input
              type="date"
              value={terms.periodStartedAt}
              onChange={onTermsChange("periodStartedAt")}
            />
          )}
        </label>
        <label>
          Period end
          {periodDatesLocked ? (
            <span className="partner-readonly-date">
              {partner.periodEndsAt
                ? new Date(partner.periodEndsAt).toLocaleDateString()
                : "—"}
            </span>
          ) : (
            <input
              type="date"
              value={terms.periodEndsAt}
              onChange={onTermsChange("periodEndsAt")}
            />
          )}
        </label>
        <div className="partner-form-actions" style={{ gridColumn: "1 / -1" }}>
          <button type="button" onClick={applyFormulaCap}>
            Use formula cap
          </button>
          <button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save terms"}
          </button>
        </div>
        {termsError && <div className="partner-error">{termsError}</div>}
        {termsSaved && (
          <div className="partner-success">Terms saved — period &amp; cap updated</div>
        )}
      </form>

      <h2 className="partner-section-title">Withdrawals</h2>
      <p className="partner-subtitle" style={{ marginBottom: 12 }}>
        Partner requests only — cash settlement is handled outside the platform.
      </p>
      <div className="partner-table-wrap">
        {withdrawals.length === 0 ? (
          <div className="partner-empty">No withdrawal requests yet</div>
        ) : (
          <table className="partner-table responsive-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Investment</th>
                <th>Earnings</th>
                <th>Total</th>
                <th>Period</th>
                <th>Status</th>
                <th>Notes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {withdrawals.map((w) => (
                <tr key={w._id}>
                  <td data-label="Date">
                    {w.createdAt
                      ? new Date(w.createdAt).toLocaleString()
                      : "—"}
                  </td>
                  <td data-label="Type">{withdrawalTypeLabel(w.type)}</td>
                  <td data-label="Investment">QAR {Number(w.investmentAmount || 0).toLocaleString()}</td>
                  <td data-label="Earnings">QAR {Number(w.earningsAmount || 0).toLocaleString()}</td>
                  <td data-label="Total">QAR {Number(w.totalAmount || 0).toLocaleString()}</td>
                  <td data-label="Period">#{w.period}</td>
                  <td data-label="Status">
                    <span className={`partner-badge ${w.status}`}>
                      {w.status}
                    </span>
                  </td>
                  <td data-label="Notes">
                    {[w.partnerNote, w.adminNote].filter(Boolean).join(" · ") ||
                      "—"}
                  </td>
                  <td data-label="Actions">
                    <div className="partner-header-actions">
                      {w.status === "pending" && (
                        <>
                          <button
                            type="button"
                            className="partner-add-btn"
                            disabled={updatingWithdrawal}
                            onClick={() =>
                              handleWithdrawalStatus(w._id, "approved")
                            }
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={updatingWithdrawal}
                            onClick={() =>
                              handleWithdrawalStatus(w._id, "rejected")
                            }
                          >
                            Reject
                          </button>
                          <button
                            type="button"
                            disabled={updatingWithdrawal}
                            onClick={() =>
                              handleWithdrawalStatus(w._id, "paid")
                            }
                          >
                            Mark paid
                          </button>
                        </>
                      )}
                      {w.status === "approved" && (
                        <>
                          <button
                            type="button"
                            className="partner-add-btn"
                            disabled={updatingWithdrawal}
                            onClick={() => handleWithdrawalStatus(w._id, "paid")}
                          >
                            Mark paid
                          </button>
                          <button
                            type="button"
                            disabled={updatingWithdrawal}
                            onClick={() =>
                              handleWithdrawalStatus(w._id, "rejected")
                            }
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {w.status !== "pending" && w.status !== "approved" && (
                        <span>—</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <h2 className="partner-section-title">Earnings</h2>
      <div className="partner-table-wrap">
        {earnings.length === 0 ? (
          <div className="partner-empty">No attributed jobs yet</div>
        ) : (
          <table className="partner-table responsive-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Client</th>
                <th>Service</th>
                <th>Amount</th>
                <th>Period</th>
              </tr>
            </thead>
            <tbody>
              {earnings.map((e) => (
                <tr key={e._id}>
                  <td data-label="Date">
                    {e.createdAt
                      ? new Date(e.createdAt).toLocaleString()
                      : "—"}
                  </td>
                  <td data-label="Client">{e.job?.clientName || "—"}</td>
                  <td data-label="Service">{e.job?.jobType || "—"}</td>
                  <td data-label="Amount">QAR {Number(e.amount || 0).toLocaleString()}</td>
                  <td data-label="Period">#{e.period}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default PartnerDetails;
