import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  useGetBusinessQuery,
  useGetBusinessStatsQuery,
  useUpdateBusinessMutation,
  useCreateBusinessUserMutation,
  useUpdateBusinessUserMutation,
  useResetBusinessUserPasswordMutation,
} from "../../store/businessApi";
import "./Businesses.css";

function BusinessDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data, isLoading, error, refetch } = useGetBusinessQuery(id);
  const { data: stats } = useGetBusinessStatsQuery(id);
  const [updateBusiness, { isLoading: saving }] = useUpdateBusinessMutation();
  const [createUser, { isLoading: creatingUser }] = useCreateBusinessUserMutation();
  const [updateUser] = useUpdateBusinessUserMutation();
  const [resetPassword] = useResetBusinessUserPasswordMutation();

  const business = data?.business;
  const users = data?.users || [];

  const [form, setForm] = useState(null);
  const [saveError, setSaveError] = useState("");
  const [saveOk, setSaveOk] = useState("");

  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    role: "staff",
  });
  const [userError, setUserError] = useState("");

  const [resetTarget, setResetTarget] = useState(null);
  const [tempPassword, setTempPassword] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetOk, setResetOk] = useState("");

  useEffect(() => {
    if (business) {
      setForm({
        name: business.name || "",
        phone: business.phone || "",
        email: business.email || "",
        address: business.address || "",
        cutType: business.cutType === "profit" ? "profit" : "revenue",
        cutPercent: business.cutPercent ?? 0,
        isActive: business.isActive !== false,
      });
    }
  }, [business]);

  const onChange = (field) => (e) => {
    const value = field === "isActive" ? e.target.checked : e.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaveError("");
    setSaveOk("");
    if (!form?.name?.trim()) {
      setSaveError("Name is required");
      return;
    }
    const cut = Number(form.cutPercent);
    if (Number.isNaN(cut) || cut < 0 || cut > 100) {
      setSaveError("Cut percent must be between 0 and 100");
      return;
    }
    try {
      await updateBusiness({
        id,
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        address: form.address.trim(),
        cutType: form.cutType,
        cutPercent: cut,
        isActive: form.isActive,
      }).unwrap();
      setSaveOk("Saved");
      refetch();
    } catch (err) {
      setSaveError(err?.data?.message || "Failed to save");
    }
  };

  const toggleActive = async () => {
    if (!form) return;
    const next = !form.isActive;
    try {
      await updateBusiness({ id, isActive: next }).unwrap();
      setForm((prev) => ({ ...prev, isActive: next }));
      setSaveOk(next ? "Business activated" : "Business deactivated");
      refetch();
    } catch (err) {
      setSaveError(err?.data?.message || "Failed to update status");
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    setUserError("");
    if (!newUser.name.trim() || !newUser.email.trim() || !newUser.password) {
      setUserError("Name, email, and password are required");
      return;
    }
    if (newUser.password.length < 6) {
      setUserError("Password must be at least 6 characters");
      return;
    }
    try {
      await createUser({
        businessId: id,
        name: newUser.name.trim(),
        email: newUser.email.trim(),
        phone: newUser.phone.trim(),
        password: newUser.password,
        role: newUser.role,
      }).unwrap();
      setShowAddUser(false);
      setNewUser({ name: "", email: "", phone: "", password: "", role: "staff" });
      refetch();
    } catch (err) {
      setUserError(err?.data?.message || "Failed to create user");
    }
  };

  const toggleUserActive = async (user) => {
    try {
      await updateUser({
        businessId: id,
        userId: user._id,
        isActive: !user.isActive,
      }).unwrap();
      refetch();
    } catch (err) {
      alert(err?.data?.message || "Failed to update user");
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setResetError("");
    setResetOk("");
    if (!tempPassword || tempPassword.length < 6) {
      setResetError("Password must be at least 6 characters");
      return;
    }
    try {
      await resetPassword({
        businessId: id,
        userId: resetTarget._id,
        password: tempPassword,
      }).unwrap();
      setResetOk("Password updated. Share it offline with the partner.");
      setTempPassword("");
    } catch (err) {
      setResetError(err?.data?.message || "Failed to reset password");
    }
  };

  // Failure first: `form` is only filled from a successful response, so a
  // settled failure must not fall into the loading guard below and spin forever.
  if (error || (!isLoading && !business)) {
    return (
      <div className="biz-form-page">
        <button type="button" className="biz-back" onClick={() => navigate("/businesses")}>
          ← Back
        </button>
        <div className="biz-empty">
          {error ? "Could not load this business. Please try again." : "Business not found"}
        </div>
      </div>
    );
  }

  if (isLoading || !form) {
    return <div className="biz-loading">Loading business…</div>;
  }

  const jobsUrl = `/jobs?search=${encodeURIComponent(business.name || "")}`;

  return (
    <div className="biz-form-page" style={{ maxWidth: 960 }}>
      <button type="button" className="biz-back" onClick={() => navigate("/businesses")}>
        ← Back to businesses
      </button>

      <div className="biz-header-row" style={{ paddingBottom: 12 }}>
        <div>
          <h1 className="biz-title">{business.name}</h1>
          <span
            className={`biz-badge ${form.isActive ? "active" : "inactive"}`}
            style={{ marginTop: 8 }}
          >
            {form.isActive ? "Active" : "Inactive"}
          </span>
        </div>
        <div className="biz-header-actions">
          <button
            type="button"
            className="biz-btn-secondary"
            onClick={() => navigate(jobsUrl)}
          >
            View jobs
          </button>
          <button type="button" className="biz-btn-danger" onClick={toggleActive}>
            {form.isActive ? "Deactivate" : "Reactivate"}
          </button>
        </div>
      </div>

      {stats && (
        <div className="biz-stats">
          <div className="biz-stat">
            <div className="biz-stat-value">{stats.jobsOpen ?? 0}</div>
            <div className="biz-stat-label">Open</div>
          </div>
          <div className="biz-stat">
            <div className="biz-stat-value">{stats.jobsInProgress ?? 0}</div>
            <div className="biz-stat-label">In progress</div>
          </div>
          <div className="biz-stat">
            <div className="biz-stat-value">{stats.jobsCompleted ?? 0}</div>
            <div className="biz-stat-label">Completed</div>
          </div>
          <div className="biz-stat">
            <div className="biz-stat-value">
              {Number(stats.estimatedEarnings || 0).toFixed(2)}
            </div>
            <div className="biz-stat-label">Est. cut earnings</div>
          </div>
        </div>
      )}

      <form onSubmit={handleSave}>
        <div className="biz-form-card">
          <h2 className="biz-section-title">Company</h2>
          <div className="biz-form-grid">
            <div className="biz-field full">
              <label>Name *</label>
              <input value={form.name} onChange={onChange("name")} required />
            </div>
            <div className="biz-field">
              <label>Phone</label>
              <input value={form.phone} onChange={onChange("phone")} />
            </div>
            <div className="biz-field">
              <label>Email</label>
              <input type="email" value={form.email} onChange={onChange("email")} />
            </div>
            <div className="biz-field full">
              <label>Address</label>
              <textarea value={form.address} onChange={onChange("address")} />
            </div>
            <div className="biz-field">
              <label>Cut type</label>
              <select value={form.cutType} onChange={onChange("cutType")}>
                <option value="revenue">Revenue</option>
                <option value="profit">Profit</option>
              </select>
            </div>
            <div className="biz-field">
              <label>Cut percent</label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={form.cutPercent}
                onChange={onChange("cutPercent")}
              />
            </div>
            <div className="biz-field">
              <label>Default source</label>
              <input
                value={
                  business.defaultSource?.mainSourceName || "Business Portal"
                }
                disabled
              />
            </div>
          </div>
          {saveError && <div className="biz-error">{saveError}</div>}
          {saveOk && (
            <div className="biz-muted" style={{ marginTop: 8, color: "#027a48" }}>
              {saveOk}
            </div>
          )}
          <div className="biz-actions">
            <button type="submit" className="biz-btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </form>

      <div className="biz-detail-card">
        <div className="biz-users-header">
          <h2 className="biz-section-title" style={{ margin: 0 }}>
            Portal users
          </h2>
          <button
            type="button"
            className="biz-btn-primary"
            onClick={() => {
              setUserError("");
              setShowAddUser(true);
            }}
          >
            Add user
          </button>
        </div>

        {users.length === 0 ? (
          <div className="biz-muted">No portal users yet</div>
        ) : (
          <table className="biz-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Role</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u._id} style={{ cursor: "default" }}>
                  <td className="biz-name">{u.name}</td>
                  <td>{u.email}</td>
                  <td>{u.phone || "—"}</td>
                  <td style={{ textTransform: "capitalize" }}>{u.role}</td>
                  <td>
                    <span
                      className={`biz-badge ${u.isActive === false ? "inactive" : "active"}`}
                    >
                      {u.isActive === false ? "Inactive" : "Active"}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="biz-btn-secondary"
                        style={{ padding: "6px 10px", fontSize: 13 }}
                        onClick={() => toggleUserActive(u)}
                      >
                        {u.isActive === false ? "Activate" : "Deactivate"}
                      </button>
                      <button
                        type="button"
                        className="biz-btn-secondary"
                        style={{ padding: "6px 10px", fontSize: 13 }}
                        onClick={() => {
                          setResetTarget(u);
                          setTempPassword("");
                          setResetError("");
                          setResetOk("");
                        }}
                      >
                        Reset password
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAddUser && (
        <div className="biz-modal-backdrop" onClick={() => setShowAddUser(false)}>
          <div className="biz-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="biz-section-title">Add portal user</h2>
            <form onSubmit={handleAddUser}>
              <div className="biz-form-grid" style={{ gridTemplateColumns: "1fr" }}>
                <div className="biz-field">
                  <label>Name *</label>
                  <input
                    value={newUser.name}
                    onChange={(e) =>
                      setNewUser((p) => ({ ...p, name: e.target.value }))
                    }
                  />
                </div>
                <div className="biz-field">
                  <label>Email *</label>
                  <input
                    type="email"
                    value={newUser.email}
                    onChange={(e) =>
                      setNewUser((p) => ({ ...p, email: e.target.value }))
                    }
                  />
                </div>
                <div className="biz-field">
                  <label>Phone</label>
                  <input
                    value={newUser.phone}
                    onChange={(e) =>
                      setNewUser((p) => ({ ...p, phone: e.target.value }))
                    }
                  />
                </div>
                <div className="biz-field">
                  <label>Role</label>
                  <select
                    value={newUser.role}
                    onChange={(e) =>
                      setNewUser((p) => ({ ...p, role: e.target.value }))
                    }
                  >
                    <option value="owner">Owner</option>
                    <option value="staff">Staff</option>
                  </select>
                </div>
                <div className="biz-field">
                  <label>Password *</label>
                  <input
                    type="text"
                    value={newUser.password}
                    onChange={(e) =>
                      setNewUser((p) => ({ ...p, password: e.target.value }))
                    }
                  />
                </div>
              </div>
              {userError && <div className="biz-error">{userError}</div>}
              <div className="biz-actions">
                <button
                  type="submit"
                  className="biz-btn-primary"
                  disabled={creatingUser}
                >
                  {creatingUser ? "Creating…" : "Create user"}
                </button>
                <button
                  type="button"
                  className="biz-btn-secondary"
                  onClick={() => setShowAddUser(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {resetTarget && (
        <div
          className="biz-modal-backdrop"
          onClick={() => setResetTarget(null)}
        >
          <div className="biz-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="biz-section-title">Reset password</h2>
            <p className="biz-muted" style={{ marginTop: 0 }}>
              Set a temporary password for <strong>{resetTarget.email}</strong>.
              Share it offline — no email is sent.
            </p>
            <form onSubmit={handleResetPassword}>
              <div className="biz-field">
                <label>New password *</label>
                <input
                  type="text"
                  value={tempPassword}
                  onChange={(e) => setTempPassword(e.target.value)}
                  autoFocus
                />
              </div>
              {resetError && <div className="biz-error">{resetError}</div>}
              {resetOk && (
                <div className="biz-muted" style={{ color: "#027a48", marginTop: 8 }}>
                  {resetOk}
                </div>
              )}
              <div className="biz-actions">
                <button type="submit" className="biz-btn-primary">
                  Reset password
                </button>
                <button
                  type="button"
                  className="biz-btn-secondary"
                  onClick={() => setResetTarget(null)}
                >
                  Close
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default BusinessDetails;
