import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useSelector } from "react-redux";
import DataTable from "../../components/DataTable/DataTable.jsx";
import PrimaryButton from "../../components/PrimaryButton.jsx";
import {
  useCreateJobPurchaseMutation,
  useListJobsQuery,
  useListPurchasesQuery,
  useListVendorsQuery,
  useVendorPurchaseSummaryQuery,
  useVoidPurchaseMutation,
} from "../../store/portalApi";
import "./Purchases.css";

const PAGE_SIZE = 15;
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

function formatMoney(value) {
  if (value == null || value === "") return "—";
  return `QAR ${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Qatar",
  });
}

function qatarToday() {
  const now = new Date();
  const qatar = new Date(now.getTime() + (now.getTimezoneOffset() + 180) * 60000);
  const month = String(qatar.getMonth() + 1).padStart(2, "0");
  const day = String(qatar.getDate()).padStart(2, "0");
  return `${qatar.getFullYear()}-${month}-${day}`;
}

const emptyForm = {
  jobId: "",
  vendor_id: "",
  description: "",
  sku: "",
  quantity: 1,
  unit_cost: "",
  receipt_ref: "",
  notes: "",
};

function Purchases() {
  const [searchParams, setSearchParams] = useSearchParams();
  const token = useSelector((state) => state.auth.token);

  const page = Math.max(Number(searchParams.get("page")) || 1, 1);
  const vendorFilter = searchParams.get("vendor_id") || "";
  const jobFilter = searchParams.get("job_id") || "";
  const fromFilter = searchParams.get("from") || "";
  const toFilter = searchParams.get("to") || "";
  const searchTerm = searchParams.get("search") || "";

  const [searchInput, setSearchInput] = useState(searchTerm);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setSearchInput(searchTerm);
  }, [searchTerm]);

  const { data, isLoading, isFetching, refetch } = useListPurchasesQuery({
    page,
    limit: PAGE_SIZE,
    search: searchTerm,
    vendor_id: vendorFilter || undefined,
    job_id: jobFilter || undefined,
    from: fromFilter || undefined,
    to: toFilter || undefined,
  });

  const { data: summaryData } = useVendorPurchaseSummaryQuery({
    vendor_id: vendorFilter || undefined,
    from: fromFilter || undefined,
    to: toFilter || undefined,
  });

  const { data: vendorData } = useListVendorsQuery({ isActive: true });
  const { data: jobsData } = useListJobsQuery({ page: 1, limit: 50 });
  const [createPurchase, { isLoading: creating }] = useCreateJobPurchaseMutation();
  const [voidPurchase, { isLoading: voiding }] = useVoidPurchaseMutation();

  const purchases = data?.purchases || [];
  const total = data?.total || 0;
  const pages = data?.pages || 1;
  const vendors = vendorData?.vendors || [];
  const jobs = jobsData?.jobs || [];
  const summary = summaryData?.summary || [];

  const lineTotal = useMemo(() => {
    const qty = Number(form.quantity) || 0;
    const unit = Number(form.unit_cost) || 0;
    return Math.round(qty * unit * 100) / 100;
  }, [form.quantity, form.unit_cost]);

  const updateParams = (patch) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    if (!patch.page) next.set("page", "1");
    setSearchParams(next);
  };

  const handleExport = async () => {
    const params = new URLSearchParams();
    if (searchTerm) params.set("search", searchTerm);
    if (vendorFilter) params.set("vendor_id", vendorFilter);
    if (jobFilter) params.set("job_id", jobFilter);
    if (fromFilter) params.set("from", fromFilter);
    if (toFilter) params.set("to", toFilter);
    const res = await fetch(
      `${API_BASE_URL}/finance/purchases/export.csv?${params.toString()}`,
      { headers: { authorization: `Bearer ${token}` } }
    );
    if (!res.ok) {
      setMessage("Export failed.");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `finance-purchases-${qatarToday()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openCreate = () => {
    setForm({
      ...emptyForm,
      jobId: jobFilter || "",
      vendor_id: vendorFilter || "",
    });
    setFormError("");
    setModalOpen(true);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!form.jobId) {
      setFormError("Select a job.");
      return;
    }
    if (!form.vendor_id) {
      setFormError("Select a vendor.");
      return;
    }
    if (!form.description.trim()) {
      setFormError("Description is required.");
      return;
    }
    try {
      await createPurchase({
        jobId: form.jobId,
        vendor_id: form.vendor_id,
        description: form.description.trim(),
        sku: form.sku.trim(),
        quantity: Number(form.quantity),
        unit_cost: Number(form.unit_cost),
        receipt_ref: form.receipt_ref.trim(),
        notes: form.notes.trim(),
      }).unwrap();
      setModalOpen(false);
      setMessage("Purchase recorded.");
      refetch();
    } catch (err) {
      setFormError(err?.data?.message || "Could not create purchase.");
    }
  };

  const handleVoid = async (purchase) => {
    if (!window.confirm(`Remove purchase "${purchase.description}"?`)) return;
    try {
      await voidPurchase(purchase._id).unwrap();
      setMessage("Purchase removed.");
      refetch();
    } catch (err) {
      setMessage(err?.data?.message || "Could not remove purchase.");
    }
  };

  const columns = [
    {
      title: "Date",
      key: "purchased_at",
      width: "14%",
      render: (row) => formatDate(row.purchased_at),
    },
    {
      title: "Job",
      key: "job",
      width: "10%",
      render: (row) =>
        row.job?._id ? (
          <Link to={`/jobs/${row.job._id}`} className="purchases-job-link">
            {row.job.displayId || row.job.job_reference || "Job"}
          </Link>
        ) : (
          "—"
        ),
    },
    {
      title: "Vendor",
      key: "vendor",
      width: "14%",
      render: (row) => row.vendor?.name || "—",
    },
    {
      title: "Description",
      key: "description",
      width: "22%",
      render: (row) => (
        <div className="purchases-desc-cell">
          <span className="purchases-desc">{row.description}</span>
          {row.sku ? <span className="purchases-sku">SKU: {row.sku}</span> : null}
        </div>
      ),
    },
    {
      title: "Qty",
      key: "quantity",
      width: "7%",
      render: (row) => row.quantity,
    },
    {
      title: "Unit",
      key: "unit_cost",
      width: "10%",
      render: (row) => formatMoney(row.unit_cost),
    },
    {
      title: "Total",
      key: "total_cost",
      width: "10%",
      render: (row) => formatMoney(row.total_cost),
    },
    {
      title: "Receipt",
      key: "receipt_ref",
      width: "10%",
      render: (row) => row.receipt_ref || "—",
    },
    {
      title: "",
      key: "actions",
      width: "8%",
      align: "center",
      render: (row) => (
        <button
          type="button"
          className="purchases-void-btn"
          disabled={voiding}
          onClick={() => handleVoid(row)}
        >
          Remove
        </button>
      ),
    },
  ];

  return (
    <div className="purchases-container">
      <div className="purchases-header-row">
        <div className="purchases-header-copy">
          <h1 className="purchases-title">Purchases</h1>
          <p className="purchases-subtitle">
            Vendor purchase ledger — qty, unit cost, and spend per job.
          </p>
        </div>
        <div className="purchases-header-actions">
          <button type="button" className="purchases-export-btn" onClick={handleExport}>
            Export CSV
          </button>
          <PrimaryButton onClick={openCreate} disabled={creating}>
            + Record purchase
          </PrimaryButton>
        </div>
      </div>

      {summary.length > 0 && (
        <div className="purchases-summary-strip">
          {summary.slice(0, 6).map((row) => (
            <button
              key={String(row.vendor_id)}
              type="button"
              className={`purchases-summary-card${
                vendorFilter === String(row.vendor_id) ? " active" : ""
              }`}
              onClick={() =>
                updateParams({
                  vendor_id: vendorFilter === String(row.vendor_id) ? "" : String(row.vendor_id),
                  page: "1",
                })
              }
            >
              <span className="purchases-summary-name">
                {row.vendor?.name || "Unknown vendor"}
              </span>
              <strong>{formatMoney(row.totalSpend)}</strong>
              <span className="purchases-summary-meta">
                {row.purchaseCount} lines · {row.totalQuantity} units
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="purchases-filters">
        <input
          type="search"
          placeholder="Search description, SKU, receipt…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") updateParams({ search: searchInput.trim(), page: "1" });
          }}
        />
        <select
          value={vendorFilter}
          onChange={(e) => updateParams({ vendor_id: e.target.value, page: "1" })}
          aria-label="Filter by vendor"
        >
          <option value="">All vendors</option>
          {vendors.map((v) => (
            <option key={v._id} value={v._id}>
              {v.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={fromFilter}
          onChange={(e) => updateParams({ from: e.target.value, page: "1" })}
          aria-label="From date"
        />
        <input
          type="date"
          value={toFilter}
          onChange={(e) => updateParams({ to: e.target.value, page: "1" })}
          aria-label="To date"
        />
        <button
          type="button"
          className="purchases-filter-btn"
          onClick={() => updateParams({ search: searchInput.trim(), page: "1" })}
        >
          Apply
        </button>
        {(searchTerm || vendorFilter || jobFilter || fromFilter || toFilter) && (
          <button
            type="button"
            className="purchases-clear-btn"
            onClick={() => {
              setSearchInput("");
              setSearchParams({});
            }}
          >
            Clear
          </button>
        )}
      </div>

      {message && <p className="purchases-message">{message}</p>}

      <DataTable
        title="Purchase ledger"
        columns={columns}
        data={purchases}
        loading={isLoading || isFetching}
        hideFilterIcon
        filterButtonText=""
        pagination={{
          current: page,
          total,
          pageSize: PAGE_SIZE,
          onChange: (nextPage) => updateParams({ page: String(nextPage) }),
        }}
      />

      {modalOpen && (
        <div className="purchases-modal-backdrop" onClick={() => !creating && setModalOpen(false)}>
          <form
            className="purchases-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleCreate}
          >
            <h2 className="purchases-modal-title">Record purchase</h2>
            <div className="purchases-form-grid">
              <div className="purchases-form-group purchases-form-group--full">
                <label htmlFor="purchase-job">Job</label>
                <select
                  id="purchase-job"
                  value={form.jobId}
                  onChange={(e) => setForm({ ...form, jobId: e.target.value })}
                  required
                >
                  <option value="">Select job…</option>
                  {jobs.map((job) => (
                    <option key={job._id} value={job._id}>
                      {(job.job_reference || `#${String(job._id).slice(-6)}`) +
                        (job.finance_status === "audited" ? " (audited — locked)" : "")}
                    </option>
                  ))}
                </select>
              </div>
              <div className="purchases-form-group purchases-form-group--full">
                <label htmlFor="purchase-vendor">Vendor</label>
                <select
                  id="purchase-vendor"
                  value={form.vendor_id}
                  onChange={(e) => setForm({ ...form, vendor_id: e.target.value })}
                  required
                >
                  <option value="">Select vendor…</option>
                  {vendors.map((v) => (
                    <option key={v._id} value={v._id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="purchases-form-group purchases-form-group--full">
                <label htmlFor="purchase-desc">Description</label>
                <input
                  id="purchase-desc"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="e.g. Brake pads"
                  required
                />
              </div>
              <div className="purchases-form-group">
                <label htmlFor="purchase-sku">SKU</label>
                <input
                  id="purchase-sku"
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                />
              </div>
              <div className="purchases-form-group">
                <label htmlFor="purchase-receipt">Receipt ref</label>
                <input
                  id="purchase-receipt"
                  value={form.receipt_ref}
                  onChange={(e) => setForm({ ...form, receipt_ref: e.target.value })}
                />
              </div>
              <div className="purchases-form-group">
                <label htmlFor="purchase-qty">Quantity</label>
                <input
                  id="purchase-qty"
                  type="number"
                  min="0.01"
                  step="any"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  required
                />
              </div>
              <div className="purchases-form-group">
                <label htmlFor="purchase-unit">Unit cost (QAR)</label>
                <input
                  id="purchase-unit"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.unit_cost}
                  onChange={(e) => setForm({ ...form, unit_cost: e.target.value })}
                  required
                />
              </div>
              <div className="purchases-form-group">
                <label>Line total</label>
                <div className="purchases-line-total">{formatMoney(lineTotal)}</div>
              </div>
              <div className="purchases-form-group purchases-form-group--full">
                <label htmlFor="purchase-notes">Notes</label>
                <textarea
                  id="purchase-notes"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
            {formError && <p className="purchases-form-error">{formError}</p>}
            <div className="purchases-modal-actions">
              <button
                type="button"
                className="purchases-cancel-btn"
                disabled={creating}
                onClick={() => setModalOpen(false)}
              >
                Cancel
              </button>
              <PrimaryButton type="submit" disabled={creating}>
                {creating ? "Saving…" : "Save purchase"}
              </PrimaryButton>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default Purchases;
