import React, { useState } from "react";
import {
  useCreateFinanceUserMutation,
  useGetFinanceUsersQuery,
  useResetFinanceUserPasswordMutation,
  useUpdateFinanceUserMutation,
} from "../../store/financeApi";
import PrimaryButton from "../../components/PrimaryButton.jsx";
import "./FinanceUsers.css";

const emptyForm = {
  name: "",
  email: "",
  phone: "",
  password: "",
  role: "operator",
  isActive: true,
};

function FinanceUsers() {
  const { data, isLoading, error, refetch } = useGetFinanceUsersQuery();
  const [createUser, { isLoading: creating }] = useCreateFinanceUserMutation();
  const [updateUser] = useUpdateFinanceUserMutation();
  const [resetPassword] = useResetFinanceUserPasswordMutation();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [resetId, setResetId] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [formError, setFormError] = useState("");

  const users = data?.users || [];

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setFormError("");
    setModalOpen(true);
  };

  const openEdit = (user) => {
    setEditingId(user.id || user._id);
    setForm({
      name: user.name || "",
      email: user.email || "",
      phone: user.phone || "",
      password: "",
      role: user.role || "operator",
      isActive: user.isActive !== false,
    });
    setFormError("");
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    try {
      if (editingId) {
        await updateUser({
          id: editingId,
          name: form.name,
          phone: form.phone,
          role: form.role,
          isActive: form.isActive,
        }).unwrap();
      } else {
        if (!form.password) {
          setFormError("Password is required for new users.");
          return;
        }
        await createUser({
          name: form.name,
          email: form.email,
          phone: form.phone,
          password: form.password,
          role: form.role,
        }).unwrap();
      }
      setModalOpen(false);
      refetch();
    } catch (err) {
      setFormError(err?.data?.message || "Save failed.");
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!resetId || !newPassword) return;
    try {
      await resetPassword({ id: resetId, password: newPassword }).unwrap();
      setResetId(null);
      setNewPassword("");
    } catch (err) {
      setFormError(err?.data?.message || "Reset failed.");
    }
  };

  return (
    <div className="biz-container">
      <div className="biz-header-row">
        <h1 className="biz-title">Finance Users</h1>
        <button type="button" className="biz-add-btn" onClick={openCreate}>
          <span>+</span>
          Add finance user
        </button>
      </div>

      <div className="biz-table-wrap">
        {isLoading ? (
          <div className="biz-loading">Loading finance users…</div>
        ) : error ? (
          <div className="biz-empty">
            Failed to load finance users. Full admin access is required.
          </div>
        ) : users.length === 0 ? (
          <div className="biz-empty">No finance users yet</div>
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
              {users.map((user) => (
                <tr key={user.id || user._id}>
                  <td>{user.name}</td>
                  <td>{user.email}</td>
                  <td>{user.phone || "—"}</td>
                  <td>{user.role}</td>
                  <td>
                    <span
                      className={`biz-status-pill ${user.isActive ? "active" : "inactive"}`}
                    >
                      {user.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>
                    <div className="biz-actions">
                      <button
                        type="button"
                        className="biz-action-btn"
                        onClick={() => openEdit(user)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="biz-action-btn"
                        onClick={() => {
                          setResetId(user.id || user._id);
                          setNewPassword("");
                          setFormError("");
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

      {modalOpen && (
        <div className="biz-modal-backdrop" onClick={() => setModalOpen(false)}>
          <form
            className="biz-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSubmit}
          >
            <h2>{editingId ? "Edit finance user" : "Add finance user"}</h2>
            <div className="biz-form-group">
              <label htmlFor="fu-name">Name</label>
              <input
                id="fu-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            {!editingId && (
              <div className="biz-form-group">
                <label htmlFor="fu-email">Email</label>
                <input
                  id="fu-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              </div>
            )}
            <div className="biz-form-group">
              <label htmlFor="fu-phone">Phone</label>
              <input
                id="fu-phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            {!editingId && (
              <div className="biz-form-group">
                <label htmlFor="fu-password">Password</label>
                <input
                  id="fu-password"
                  type="password"
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                  required
                />
              </div>
            )}
            <div className="biz-form-group">
              <label htmlFor="fu-role">Role</label>
              <select
                id="fu-role"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                <option value="operator">Operator</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            {editingId && (
              <div className="biz-form-group">
                <label htmlFor="fu-active">Active</label>
                <select
                  id="fu-active"
                  value={form.isActive ? "true" : "false"}
                  onChange={(e) =>
                    setForm({ ...form, isActive: e.target.value === "true" })
                  }
                >
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </div>
            )}
            {formError && <p className="biz-empty">{formError}</p>}
            <div className="biz-modal-actions">
              <PrimaryButton type="submit" disabled={creating}>
                {creating ? "Saving…" : "Save"}
              </PrimaryButton>
              <button type="button" className="biz-action-btn" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {resetId && (
        <div className="biz-modal-backdrop" onClick={() => setResetId(null)}>
          <form
            className="biz-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleResetPassword}
          >
            <h2>Reset password</h2>
            <div className="biz-form-group">
              <label htmlFor="fu-new-password">New password</label>
              <input
                id="fu-new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <div className="biz-modal-actions">
              <PrimaryButton type="submit">Reset</PrimaryButton>
              <button type="button" className="biz-action-btn" onClick={() => setResetId(null)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default FinanceUsers;
