import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useGetPartnersQuery,
  useCreatePartnerMutation,
} from "../../store/partnerApi";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import "./Partners.css";

function statusClass(status) {
  if (status === "active") return "partner-badge active";
  if (status === "capped") return "partner-badge capped";
  if (status === "frozen") return "partner-badge frozen";
  return "partner-badge inactive";
}

function Partners() {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 400);
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    password: "",
    investmentAmount: 10000,
    profitPerPeriod: 4000,
    currentPeriodCap: 14000,
    periodMonths: 2,
  });

  const queryArgs = useMemo(() => {
    const args = { page: 1, limit: 100, search: debouncedSearch.trim() };
    if (statusFilter !== "all") args.status = statusFilter;
    return args;
  }, [debouncedSearch, statusFilter]);

  const { data, isLoading, isFetching } = useGetPartnersQuery(queryArgs);
  const [createPartner, { isLoading: creating }] = useCreatePartnerMutation();
  const partners = data?.partners || [];

  const onChange = (field) => (e) => {
    setForm((p) => {
      const next = { ...p, [field]: e.target.value };
      if (field === "investmentAmount" || field === "profitPerPeriod") {
        const inv = Number(field === "investmentAmount" ? e.target.value : next.investmentAmount);
        const profit = Number(field === "profitPerPeriod" ? e.target.value : next.profitPerPeriod);
        if (!Number.isNaN(inv) && !Number.isNaN(profit)) {
          next.currentPeriodCap = inv + profit;
        }
      }
      return next;
    });
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await createPartner({
        ...form,
        investmentAmount: Number(form.investmentAmount),
        profitPerPeriod: Number(form.profitPerPeriod),
        currentPeriodCap: Number(form.currentPeriodCap),
        periodMonths: Number(form.periodMonths),
      }).unwrap();
      setShowCreate(false);
      setForm({
        name: "",
        phone: "",
        email: "",
        password: "",
        investmentAmount: 10000,
        profitPerPeriod: 4000,
        currentPeriodCap: 14000,
        periodMonths: 2,
      });
    } catch (err) {
      setError(err?.data?.message || "Failed to create partner");
    }
  };

  return (
    <div className="partner-container">
      <div className="partner-header-row">
        <div>
          <h1 className="partner-title">Partner Management</h1>
          <p className="partner-subtitle">
            Acquisition partners · Google source · period caps in QAR
          </p>
        </div>
        <div className="partner-header-actions">
          <div className="partner-search">
            <input
              placeholder="Search name, email, phone"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="capped">Capped</option>
            <option value="frozen">Frozen</option>
            <option value="inactive">Inactive</option>
          </select>
          <button
            type="button"
            className="partner-add-btn"
            onClick={() => setShowCreate(true)}
          >
            + Add partner
          </button>
        </div>
      </div>

      <div className="partner-table-wrap">
        {isLoading || isFetching ? (
          <div className="partner-empty">Loading…</div>
        ) : partners.length === 0 ? (
          <div className="partner-empty">No partners found</div>
        ) : (
          <table className="partner-table responsive-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Investment</th>
                <th>Period</th>
                <th>Accrued / Cap</th>
                <th>Days left</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {partners.map((p) => (
                <tr
                  key={p._id}
                  className="partner-row"
                  onClick={() => navigate(`/partners/${p._id}`)}
                >
                  <td data-label="Name">
                    <div className="partner-name">{p.name}</div>
                    <div className="partner-muted">{p.email || p.phone || "—"}</div>
                  </td>
                  <td data-label="Investment">QAR {Number(p.investmentAmount || 0).toLocaleString()}</td>
                  <td data-label="Period">#{p.currentPeriod}</td>
                  <td data-label="Accrued / Cap">
                    QAR {Number(p.accruedTotal || 0).toLocaleString()} /{" "}
                    {Number(p.periodCap || 0).toLocaleString()}
                  </td>
                  <td data-label="Days left">{p.daysLeft ?? "—"}</td>
                  <td data-label="Status">
                    <span className={statusClass(p.status)}>{p.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <div className="partner-modal-backdrop" onClick={() => setShowCreate(false)}>
          <div
            className="partner-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Add partner</h2>
            <p className="partner-muted">
              Creates Google sub-source with this exact name for job attribution.
            </p>
            <form onSubmit={handleCreate} className="partner-form">
              <label>
                Name (sub-source)
                <input required value={form.name} onChange={onChange("name")} />
              </label>
              <label>
                Phone
                <input value={form.phone} onChange={onChange("phone")} />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={form.email}
                  onChange={onChange("email")}
                />
              </label>
              <label>
                App password
                <input
                  type="password"
                  required
                  minLength={6}
                  value={form.password}
                  onChange={onChange("password")}
                />
              </label>
              <label>
                Investment (QAR)
                <input
                  type="number"
                  min={0}
                  value={form.investmentAmount}
                  onChange={onChange("investmentAmount")}
                />
              </label>
              <label>
                Profit per period (QAR)
                <input
                  type="number"
                  min={0}
                  value={form.profitPerPeriod}
                  onChange={onChange("profitPerPeriod")}
                />
              </label>
              <label>
                Period cap (QAR)
                <input
                  type="number"
                  min={0}
                  value={form.currentPeriodCap}
                  onChange={onChange("currentPeriodCap")}
                />
              </label>
              <label>
                Period length (months)
                <input
                  type="number"
                  min={1}
                  value={form.periodMonths}
                  onChange={onChange("periodMonths")}
                />
              </label>
              {error && <div className="partner-error">{error}</div>}
              <div className="partner-form-actions">
                <button type="button" onClick={() => setShowCreate(false)}>
                  Cancel
                </button>
                <button type="submit" disabled={creating}>
                  {creating ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Partners;
