import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useGetFinanceOverviewJobsQuery,
  useGetFinanceOverviewSummaryQuery,
} from "../../store/financeApi";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { getJobDisplayId } from "../../utils/jobLabel.js";
import "./Finance.css";

const PAGE_SIZE = 20;

const PAYMENT_METHOD_LABELS = {
  card: "Card",
  wallet: "Wallet",
  cash: "Cash",
  fawran: "Fawran",
};

function money(value) {
  if (value === null || value === undefined || value === "") return "-";
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return `QR ${num.toFixed(2)}`;
}

/**
 * finance_revenue / finance_cost_total / finance_net_profit are only snapshotted
 * when finance audits the job, so a non-audited row genuinely has no figure yet.
 * Say so — a bare dash reads as "zero" or "data missing".
 */
function jobMoney(job, value) {
  const num = Number(value);
  if (value === null || value === undefined || value === "" || !Number.isFinite(num)) {
    return job?.finance_status === "audited" ? "-" : "Not audited";
  }
  return money(num);
}

function formatCompletedAt(job) {
  const value = job?.completed_at || job?.createdAt;
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const day = date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Qatar",
  });
  const time = date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Qatar",
  });
  return `${day} - ${time}`;
}

function paymentMethodLabel(job) {
  const method = String(job?.payment_method || "").trim().toLowerCase();
  if (!method) return "-";
  return PAYMENT_METHOD_LABELS[method] || method;
}

function netProfitClass(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "";
  return num < 0 ? "negative" : "positive";
}

/**
 * Only 401/403 is a permissions problem. A rejected date filter comes back as
 * 400 { message } and a broken aggregation as 500 { message }, so reporting
 * every failure as "full admin access is required" sends the admin hunting for
 * the wrong thing.
 */
function errorDetail(error) {
  const status = error?.status;
  if (status === 401 || status === 403) return "Full admin access is required.";
  return error?.data?.message || "Please try again.";
}

/**
 * `moneyUnavailable` is set when the API could not compute the bucket's totals
 * (summary.pendingComputed === false). The counts are still real, but the money
 * must not be drawn as QR 0.00 — that reads as "no profit" instead of "unknown".
 */
function SummaryCard({ tone, title, subtitle, bucket, loading, moneyUnavailable }) {
  const data = bucket || {};
  const amount = (value) => {
    if (loading) return "...";
    if (moneyUnavailable) return "—";
    return money(value);
  };
  return (
    <div className={`fin-summary-card ${tone}`}>
      <div className="fin-summary-head">
        <span className="fin-summary-title">{title}</span>
        <span className={`fin-summary-pill ${tone}`}>
          {loading ? "..." : `${data.count ?? 0} jobs`}
        </span>
      </div>
      <p className="fin-summary-subtitle">{subtitle}</p>
      <div className="fin-summary-grid">
        <div className="fin-summary-stat">
          <span className="fin-summary-label">Revenue</span>
          <span className="fin-summary-value">{amount(data.revenue)}</span>
        </div>
        <div className="fin-summary-stat">
          <span className="fin-summary-label">Cost total</span>
          <span className="fin-summary-value">{amount(data.costTotal)}</span>
        </div>
        <div className="fin-summary-stat fin-summary-stat-wide">
          <span className="fin-summary-label">Net profit</span>
          <span className="fin-summary-value fin-summary-value-strong">
            {amount(data.netProfit)}
          </span>
        </div>
      </div>
      {!loading && moneyUnavailable ? (
        <p className="fin-summary-unavailable">
          Totals unavailable — the recompute timed out. The job count is accurate.
        </p>
      ) : null}
    </div>
  );
}

function Finance() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("audited");
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 400);
  const hasFilters = Boolean(debouncedSearch || from || to);

  const {
    data: summary,
    isLoading: summaryLoading,
    isFetching: summaryFetching,
    error: summaryError,
  } = useGetFinanceOverviewSummaryQuery({
    search: debouncedSearch,
    from: from || undefined,
    to: to || undefined,
  });

  const { data, isFetching, error } = useGetFinanceOverviewJobsQuery({
    status,
    page,
    limit: PAGE_SIZE,
    search: debouncedSearch,
    from: from || undefined,
    to: to || undefined,
  });

  const jobs = data?.jobs || [];
  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const switchStatus = (next) => {
    setStatus(next);
    setPage(1);
  };

  const handleSearchChange = (value) => {
    setSearchInput(value);
    setPage(1);
  };

  const handleFromChange = (value) => {
    setFrom(value);
    setPage(1);
  };

  const handleToChange = (value) => {
    setTo(value);
    setPage(1);
  };

  const resetFilters = () => {
    setSearchInput("");
    setFrom("");
    setTo("");
    setPage(1);
  };

  const showTableLoading = isFetching && jobs.length === 0;

  return (
    <div className="fin-container">
      <div className="fin-header-row">
        <h1 className="fin-title">Finance</h1>
        <span className="fin-readonly-note">
          Read-only overview. Auditing is done in the finance portal.
        </span>
      </div>

      {summaryError ? (
        <div className="fin-summary-error">
          Failed to load the finance summary. {errorDetail(summaryError)}
        </div>
      ) : (
        <>
          {hasFilters ? (
            <p className="fin-summary-filter-note">Totals match the filters below.</p>
          ) : null}
          <div className="fin-summary-row">
            <SummaryCard
              tone="audited"
              title="Audited finance"
              subtitle="Completed jobs finance has signed off."
              bucket={summary?.audited}
              loading={summaryLoading || summaryFetching}
            />
            <SummaryCard
              tone="pending"
              title="Non-audited finance"
              subtitle="Completed jobs still awaiting a finance audit."
              bucket={summary?.pending}
              loading={summaryLoading || summaryFetching}
              moneyUnavailable={!summaryLoading && !summaryFetching && summary?.pendingComputed === false}
            />
            <div className="fin-summary-card total">
              <span className="fin-summary-title">Total completed jobs</span>
              <span className="fin-summary-big">
                {summaryLoading || summaryFetching ? "..." : summary?.totalCompleted ?? 0}
              </span>
              <span className="fin-summary-label">
                {hasFilters
                  ? "Completed jobs matching these filters."
                  : "Every completed job, audited or not."}
              </span>
            </div>
          </div>
        </>
      )}

      <div className="fin-controls">
        <div className="fin-tabs" role="tablist" aria-label="Finance status">
          <button
            type="button"
            role="tab"
            aria-selected={status === "audited"}
            className={`fin-tab${status === "audited" ? " active" : ""}`}
            onClick={() => switchStatus("audited")}
          >
            Audited
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={status === "pending"}
            className={`fin-tab${status === "pending" ? " active" : ""}`}
            onClick={() => switchStatus("pending")}
          >
            Non-audited
          </button>
        </div>

        <div className="fin-field fin-search-field">
          <label htmlFor="fin-search">Search</label>
          <input
            id="fin-search"
            type="search"
            placeholder="Job ID, client, phone, issue..."
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>

        <div className="fin-field">
          <label htmlFor="fin-from">From</label>
          <input
            id="fin-from"
            type="date"
            value={from}
            onChange={(e) => handleFromChange(e.target.value)}
          />
        </div>

        <div className="fin-field">
          <label htmlFor="fin-to">To</label>
          <input
            id="fin-to"
            type="date"
            value={to}
            onChange={(e) => handleToChange(e.target.value)}
          />
        </div>

        <button type="button" className="fin-reset-btn" onClick={resetFilters}>
          Reset
        </button>
      </div>

      <div className="fin-table-wrap">
        {showTableLoading ? (
          <div className="fin-loading">Loading finance jobs...</div>
        ) : error ? (
          <div className="fin-error">
            Failed to load finance jobs. {errorDetail(error)}
          </div>
        ) : jobs.length === 0 ? (
          <div className="fin-empty">
            {status === "audited"
              ? "No audited jobs match these filters"
              : "No non-audited jobs match these filters"}
          </div>
        ) : (
          <table className="fin-table">
            <thead>
              <tr>
                <th>Job ID</th>
                <th>Client Name</th>
                <th>Payment Method</th>
                <th>Completed At</th>
                <th className="fin-num">Revenue</th>
                <th className="fin-num">Cost Total</th>
                <th className="fin-num">Net Profit</th>
                <th>Audit Status</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const audited = job.finance_status === "audited";
                const reauditCount = Number(job.finance_reaudit_count) || 0;
                return (
                  <tr
                    key={job._id}
                    onClick={() => navigate(`/jobs/${job._id}`)}
                    title="Open job details"
                  >
                    <td>
                      <span className="fin-job-id">{getJobDisplayId(job)}</span>
                    </td>
                    <td>
                      <div className="fin-client-name">
                        {job.clientName || "-"}
                      </div>
                      <div className="fin-client-phone">
                        {job.clientMobileNumber || ""}
                      </div>
                    </td>
                    <td>
                      <span className="fin-pill method">
                        {paymentMethodLabel(job)}
                      </span>
                    </td>
                    <td>{formatCompletedAt(job)}</td>
                    <td className="fin-num">
                      {jobMoney(job, job.finance_revenue)}
                    </td>
                    <td className="fin-num">
                      {jobMoney(job, job.finance_cost_total)}
                    </td>
                    <td
                      className={`fin-num fin-net ${netProfitClass(
                        job.finance_net_profit
                      )}`}
                    >
                      {jobMoney(job, job.finance_net_profit)}
                    </td>
                    <td>
                      <span
                        className={`fin-pill ${audited ? "audited" : "pending"}`}
                      >
                        {audited ? "Audited" : "Not audited"}
                      </span>
                      {reauditCount > 0 && (
                        <span
                          className="fin-reaudit-badge"
                          title={`Re-audited ${reauditCount} time(s)`}
                        >
                          RE-AUDITED x{reauditCount}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="fin-pagination">
        <span className="fin-pagination-info">
          Page {page} of {totalPages} - {total} job{total === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          className="fin-page-btn"
          disabled={page <= 1}
          onClick={() => setPage((prev) => Math.max(1, prev - 1))}
        >
          Previous
        </button>
        <button
          type="button"
          className="fin-page-btn"
          disabled={page >= totalPages}
          onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
        >
          Next
        </button>
      </div>
    </div>
  );
}

export default Finance;
