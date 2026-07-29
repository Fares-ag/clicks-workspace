import React, { useMemo, useState } from "react";
import {
  useGetSubscriptionsQuery,
  useCreateSubscriptionMutation,
  useCancelSubscriptionMutation,
} from "../../store/subscriptionApi";
import "./Subscriptions.css";

function statusClass(status) {
  if (status === "active") return "sub-badge active";
  if (status === "expired") return "sub-badge expired";
  return "sub-badge cancelled";
}

function formatDate(v) {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleDateString();
  } catch {
    return "—";
  }
}

function Subscriptions() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    clientName: "",
    phone: "",
    plateNumber: "",
    vinNumber: "",
    planName: "Roadside Monthly",
    durationMonths: 12,
    price: 0,
    startDate: new Date().toISOString().slice(0, 10),
  });
  const [error, setError] = useState("");

  const queryArgs = useMemo(() => {
    const args = { page: 1, limit: 100, search: search.trim() };
    if (statusFilter !== "all") args.status = statusFilter;
    return args;
  }, [search, statusFilter]);

  const { data, isLoading, isFetching } = useGetSubscriptionsQuery(queryArgs);
  const [createSub, { isLoading: creating }] = useCreateSubscriptionMutation();
  const [cancelSub] = useCancelSubscriptionMutation();
  const subscriptions = data?.subscriptions || [];

  const onChange = (field) => (e) => {
    setForm((p) => ({ ...p, [field]: e.target.value }));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await createSub({
        ...form,
        durationMonths: Number(form.durationMonths),
        price: Number(form.price),
      }).unwrap();
      setShowCreate(false);
      setForm({
        clientName: "",
        phone: "",
        plateNumber: "",
        vinNumber: "",
        planName: "Roadside Monthly",
        durationMonths: 12,
        price: 0,
        startDate: new Date().toISOString().slice(0, 10),
      });
    } catch (err) {
      setError(err?.data?.message || "Failed to create subscription");
    }
  };

  const handleCancel = async (id) => {
    if (!window.confirm("Cancel this subscription?")) return;
    try {
      await cancelSub(id).unwrap();
    } catch (err) {
      alert(err?.data?.message || "Failed to cancel");
    }
  };

  return (
    <div className="sub-container">
      <div className="sub-header-row">
        <div>
          <h1 className="sub-title">Subscriptions</h1>
          <p className="sub-subtitle">
            Primary sales product (technician app + admin).
          </p>
        </div>
        <div className="sub-header-actions">
          <div className="sub-search">
            <input
              placeholder="Search plate, customer, plan"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button
            type="button"
            className="sub-add-btn"
            onClick={() => setShowCreate(true)}
          >
            + Add subscription
          </button>
        </div>
      </div>

      <div className="sub-table-wrap">
        {isLoading || isFetching ? (
          <div className="sub-empty">Loading…</div>
        ) : subscriptions.length === 0 ? (
          <div className="sub-empty">No subscriptions found</div>
        ) : (
          <table className="sub-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Plate</th>
                <th>Plan</th>
                <th>Dates</th>
                <th>Status</th>
                <th>Sold by</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.map((s) => (
                <tr key={s._id}>
                  <td>
                    <div className="sub-name">{s.clientName}</div>
                    <div className="sub-muted">{s.phone}</div>
                  </td>
                  <td>{s.plateNumber}</td>
                  <td>
                    {s.planName}
                    <div className="sub-muted">
                      {s.durationMonths} mo · {s.price} QAR
                    </div>
                  </td>
                  <td>
                    {formatDate(s.startDate)} → {formatDate(s.endDate)}
                  </td>
                  <td>
                    <span className={statusClass(s.status)}>{s.status}</span>
                  </td>
                  <td>
                    {s.createdByTechnicianName?.trim() ||
                      (s.created_by_technician ? "Technician" : "Admin")}
                  </td>
                  <td>
                    {s.status !== "cancelled" && (
                      <button
                        type="button"
                        className="sub-cancel-btn"
                        onClick={() => handleCancel(s._id)}
                      >
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <div className="sub-modal-backdrop" onClick={() => setShowCreate(false)}>
          <div className="sub-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add subscription</h2>
            <form onSubmit={handleCreate}>
              <label>
                Customer name *
                <input required value={form.clientName} onChange={onChange("clientName")} />
              </label>
              <label>
                Phone *
                <input required value={form.phone} onChange={onChange("phone")} />
              </label>
              <label>
                Plate *
                <input required value={form.plateNumber} onChange={onChange("plateNumber")} />
              </label>
              <label>
                VIN
                <input value={form.vinNumber} onChange={onChange("vinNumber")} />
              </label>
              <label>
                Plan name *
                <input required value={form.planName} onChange={onChange("planName")} />
              </label>
              <label>
                Duration (months) *
                <input
                  type="number"
                  min={1}
                  required
                  value={form.durationMonths}
                  onChange={onChange("durationMonths")}
                />
              </label>
              <label>
                Price *
                <input
                  type="number"
                  min={0}
                  required
                  value={form.price}
                  onChange={onChange("price")}
                />
              </label>
              <label>
                Start date
                <input
                  type="date"
                  value={form.startDate}
                  onChange={onChange("startDate")}
                />
              </label>
              {error && <div className="sub-error">{error}</div>}
              <div className="sub-modal-actions">
                <button type="submit" disabled={creating}>
                  {creating ? "Saving…" : "Create"}
                </button>
                <button type="button" onClick={() => setShowCreate(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Subscriptions;
