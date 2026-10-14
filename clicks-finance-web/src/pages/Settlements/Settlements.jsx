import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import DataTable from "../../components/DataTable/DataTable.jsx";
import PrimaryButton from "../../components/PrimaryButton.jsx";
import {
  useCreateSettlementMutation,
  useGetNextSettlementDefaultsQuery,
  useListSettlementsQuery,
  useListTechniciansQuery,
} from "../../store/portalApi";
import { formatMoney, formatPeriod, settlementTitle } from "./settlementMath";
import "./Settlements.css";

const PAGE_SIZE = 15;

const emptyForm = {
  technician_id: "",
  number: "",
  period_from: "",
  period_to: "",
};

function GapCell({ gap }) {
  if (gap === null || gap === undefined) return "—";
  const tone = gap < 0 ? "short" : gap > 0 ? "over" : "even";
  return (
    <span className={`settlement-gap settlement-gap--${tone}`}>
      {gap > 0 ? "+" : ""}
      {formatMoney(gap)}
    </span>
  );
}

function Settlements() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(Number(searchParams.get("page")) || 1, 1);
  const technicianFilter = searchParams.get("technician_id") || "";
  const statusFilter = searchParams.get("status") || "";
  const searchTerm = searchParams.get("search") || "";

  const [searchInput, setSearchInput] = useState(searchTerm);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");

  const { data, isLoading, isFetching } = useListSettlementsQuery({
    page,
    limit: PAGE_SIZE,
    technician_id: technicianFilter || undefined,
    status: statusFilter || undefined,
    search: searchTerm,
  });
  const { data: techData } = useListTechniciansQuery();
  // currentData, not data: while a newly picked technician loads, `data` still
  // holds the previous technician's defaults.
  const { currentData: defaults } = useGetNextSettlementDefaultsQuery(form.technician_id, {
    skip: !modalOpen || !form.technician_id,
  });
  const [createSettlement, { isLoading: creating }] = useCreateSettlementMutation();

  const settlements = data?.settlements || [];
  const technicians = techData?.technicians || [];

  // Picking a technician continues their numbering and starts the period the
  // day after their last settlement ended.
  // modalOpen is a dependency so reopening the dialog for the same technician
  // refills it from the cached defaults.
  useEffect(() => {
    if (!defaults || !modalOpen) return;
    setForm((current) => ({
      ...current,
      number: String(defaults.number),
      period_from: defaults.period_from,
      period_to: defaults.period_to,
    }));
  }, [defaults, modalOpen]);

  const updateParams = (patch) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    if (!patch.page) next.set("page", "1");
    setSearchParams(next);
  };

  // The table's search box reports every keystroke; wait for a pause before
  // putting the term in the URL (and so before querying).
  useEffect(() => {
    const term = searchInput.trim();
    if (term === searchTerm) return undefined;
    const timer = setTimeout(() => updateParams({ search: term }), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const openCreate = () => {
    setForm({ ...emptyForm, technician_id: technicianFilter });
    setFormError("");
    setModalOpen(true);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!form.technician_id) {
      setFormError("Select a technician.");
      return;
    }
    if (!form.period_from || !form.period_to) {
      setFormError("Choose the period this settlement covers.");
      return;
    }
    try {
      const res = await createSettlement({
        technician_id: form.technician_id,
        period_from: form.period_from,
        period_to: form.period_to,
        ...(form.number ? { number: Number(form.number) } : {}),
      }).unwrap();
      setModalOpen(false);
      navigate(`/settlements/${res.settlement._id}`);
    } catch (err) {
      setFormError(err?.data?.message || "Could not create the settlement.");
    }
  };

  const columns = [
    {
      title: "Settlement",
      key: "settlement",
      width: "24%",
      render: (row) => (
        <Link to={`/settlements/${row._id}`} className="settlement-link">
          {settlementTitle(row)}
        </Link>
      ),
    },
    {
      title: "Period",
      key: "period",
      width: "20%",
      render: (row) => formatPeriod(row.period_from, row.period_to),
    },
    { title: "Jobs", key: "jobs", width: "8%", render: (row) => row.job_count },
    {
      title: "Cash to collect",
      key: "cash_to_collect",
      width: "14%",
      render: (row) => formatMoney(row.cash_to_collect),
    },
    {
      title: "Collected",
      key: "collected",
      width: "12%",
      render: (row) =>
        row.collected_amount === null || row.collected_amount === undefined
          ? "—"
          : formatMoney(row.collected_amount),
    },
    {
      title: "Gap",
      key: "gap",
      width: "10%",
      render: (row) => (row.status === "closed" ? <GapCell gap={row.gap} /> : "—"),
    },
    {
      title: "Status",
      key: "status",
      width: "12%",
      render: (row) => (
        <span className={`settlement-status-pill ${row.status}`}>
          {row.status === "closed" ? "Closed" : "Draft"}
        </span>
      ),
    },
  ];

  return (
    <div className="settlements-container">
      <div className="settlements-header-row">
        <div className="settlements-header-copy">
          <h1 className="settlements-title">Settlements</h1>
          <p className="settlements-subtitle">
            Cash each technician owes for a period, and what was actually collected.
          </p>
        </div>
        <PrimaryButton onClick={openCreate}>+ New settlement</PrimaryButton>
      </div>

      <div className="settlements-filters">
        <select
          value={technicianFilter}
          onChange={(e) => updateParams({ technician_id: e.target.value })}
          aria-label="Filter by technician"
        >
          <option value="">All technicians</option>
          {technicians.map((tech) => (
            <option key={tech._id} value={tech._id}>
              {`${tech.firstName || ""} ${tech.lastName || ""}`.trim()}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => updateParams({ status: e.target.value })}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      <DataTable
        title="Settlements"
        columns={columns}
        data={settlements}
        loading={isLoading || isFetching}
        onSearch={setSearchInput}
        searchPlaceholder="Technician or settlement #"
        hideFilterIcon
        filterButtonText=""
        pagination={{
          current: page,
          total: data?.total || 0,
          pageSize: PAGE_SIZE,
          onChange: (nextPage) => updateParams({ page: String(nextPage) }),
        }}
      />

      {modalOpen && (
        <div
          className="settlement-modal-backdrop"
          onClick={() => !creating && setModalOpen(false)}
        >
          <form
            className="settlement-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleCreate}
          >
            <h2 className="settlement-modal-title">New settlement</h2>
            <div className="settlement-form-grid">
              <div className="settlement-form-group settlement-form-group--full">
                <label htmlFor="settlement-tech">Technician</label>
                <select
                  id="settlement-tech"
                  value={form.technician_id}
                  onChange={(e) => setForm({ ...form, technician_id: e.target.value })}
                  required
                >
                  <option value="">Select technician…</option>
                  {technicians.map((tech) => (
                    <option key={tech._id} value={tech._id}>
                      {`${tech.firstName || ""} ${tech.lastName || ""}`.trim()}
                    </option>
                  ))}
                </select>
              </div>
              <div className="settlement-form-group">
                <label htmlFor="settlement-from">From</label>
                <input
                  id="settlement-from"
                  type="date"
                  value={form.period_from}
                  onChange={(e) => setForm({ ...form, period_from: e.target.value })}
                  required
                />
              </div>
              <div className="settlement-form-group">
                <label htmlFor="settlement-to">To</label>
                <input
                  id="settlement-to"
                  type="date"
                  value={form.period_to}
                  onChange={(e) => setForm({ ...form, period_to: e.target.value })}
                  required
                />
              </div>
              <div className="settlement-form-group">
                <label htmlFor="settlement-number">Settlement #</label>
                <input
                  id="settlement-number"
                  type="number"
                  min="1"
                  step="1"
                  value={form.number}
                  onChange={(e) => setForm({ ...form, number: e.target.value })}
                />
              </div>
              <p className="settlement-form-hint settlement-form-group--full">
                The number continues from this technician's last settlement. Change it once
                to carry on from the spreadsheet's numbering.
              </p>
            </div>
            {formError && <p className="settlement-form-error">{formError}</p>}
            <div className="settlement-modal-actions">
              <button
                type="button"
                className="settlement-secondary-btn"
                disabled={creating}
                onClick={() => setModalOpen(false)}
              >
                Cancel
              </button>
              <PrimaryButton type="submit" disabled={creating}>
                {creating ? "Creating…" : "Create settlement"}
              </PrimaryButton>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default Settlements;
