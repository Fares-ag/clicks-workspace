import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useCreateBusinessMutation,
  useCreateBusinessUserMutation,
} from "../../store/businessApi";
import "./Businesses.css";

const emptyCompany = {
  name: "",
  phone: "",
  email: "",
  address: "",
  cutType: "revenue",
  cutPercent: 10,
  isActive: true,
};

const emptyUser = {
  name: "",
  email: "",
  phone: "",
  password: "",
  role: "owner",
};

function AddBusiness() {
  const navigate = useNavigate();
  const [createBusiness, { isLoading: creatingBiz }] = useCreateBusinessMutation();
  const [createUser, { isLoading: creatingUser }] = useCreateBusinessUserMutation();

  const [company, setCompany] = useState(emptyCompany);
  const [addFirstUser, setAddFirstUser] = useState(true);
  const [user, setUser] = useState(emptyUser);
  const [error, setError] = useState("");

  const onCompanyChange = (field) => (e) => {
    const value = field === "isActive" ? e.target.checked : e.target.value;
    setCompany((prev) => ({ ...prev, [field]: value }));
  };

  const onUserChange = (field) => (e) => {
    setUser((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!company.name.trim()) {
      setError("Business name is required");
      return;
    }
    const cut = Number(company.cutPercent);
    if (Number.isNaN(cut) || cut < 0 || cut > 100) {
      setError("Cut percent must be between 0 and 100");
      return;
    }
    if (addFirstUser) {
      if (!user.name.trim() || !user.email.trim() || !user.password) {
        setError("Portal user name, email, and password are required");
        return;
      }
      if (user.password.length < 6) {
        setError("Password must be at least 6 characters");
        return;
      }
    }

    try {
      const result = await createBusiness({
        name: company.name.trim(),
        phone: company.phone.trim(),
        email: company.email.trim(),
        address: company.address.trim(),
        cutType: company.cutType,
        cutPercent: cut,
        isActive: company.isActive,
      }).unwrap();

      const businessId = result.business?._id;
      if (!businessId) {
        setError("Business created but ID missing from response");
        return;
      }

      if (addFirstUser) {
        await createUser({
          businessId,
          name: user.name.trim(),
          email: user.email.trim(),
          phone: user.phone.trim(),
          password: user.password,
          role: user.role,
        }).unwrap();
      }

      navigate(`/businesses/${businessId}`);
    } catch (err) {
      setError(err?.data?.message || "Failed to create business");
    }
  };

  const busy = creatingBiz || creatingUser;

  return (
    <div className="biz-form-page">
      <button type="button" className="biz-back" onClick={() => navigate("/businesses")}>
        ← Back to businesses
      </button>
      <h1 className="biz-title" style={{ marginBottom: 20 }}>
        Add business
      </h1>

      <form onSubmit={handleSubmit}>
        <div className="biz-form-card">
          <h2 className="biz-section-title">Company</h2>
          <div className="biz-form-grid">
            <div className="biz-field full">
              <label>Name *</label>
              <input
                value={company.name}
                onChange={onCompanyChange("name")}
                required
                placeholder="Partner company name"
              />
            </div>
            <div className="biz-field">
              <label>Phone</label>
              <input value={company.phone} onChange={onCompanyChange("phone")} />
            </div>
            <div className="biz-field">
              <label>Email</label>
              <input
                type="email"
                value={company.email}
                onChange={onCompanyChange("email")}
              />
            </div>
            <div className="biz-field full">
              <label>Address</label>
              <textarea
                value={company.address}
                onChange={onCompanyChange("address")}
              />
            </div>
            <div className="biz-field">
              <label>Cut type *</label>
              <select value={company.cutType} onChange={onCompanyChange("cutType")}>
                <option value="revenue">Revenue</option>
                <option value="profit">Profit</option>
              </select>
            </div>
            <div className="biz-field">
              <label>Cut percent *</label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={company.cutPercent}
                onChange={onCompanyChange("cutPercent")}
              />
            </div>
            <div className="biz-field">
              <label>
                <input
                  type="checkbox"
                  checked={company.isActive}
                  onChange={onCompanyChange("isActive")}
                  style={{ marginRight: 8 }}
                />
                Active
              </label>
            </div>
            <div className="biz-field">
              <label>Default source</label>
              <input value="Business Portal" disabled />
            </div>
          </div>
        </div>

        <div className="biz-form-card">
          <div className="biz-users-header">
            <h2 className="biz-section-title" style={{ margin: 0 }}>
              First portal user
            </h2>
            <label className="biz-muted">
              <input
                type="checkbox"
                checked={addFirstUser}
                onChange={(e) => setAddFirstUser(e.target.checked)}
                style={{ marginRight: 8 }}
              />
              Create now
            </label>
          </div>

          {addFirstUser && (
            <div className="biz-form-grid">
              <div className="biz-field">
                <label>Name *</label>
                <input value={user.name} onChange={onUserChange("name")} />
              </div>
              <div className="biz-field">
                <label>Role</label>
                <select value={user.role} onChange={onUserChange("role")}>
                  <option value="owner">Owner</option>
                  <option value="staff">Staff</option>
                </select>
              </div>
              <div className="biz-field">
                <label>Email *</label>
                <input
                  type="email"
                  value={user.email}
                  onChange={onUserChange("email")}
                />
              </div>
              <div className="biz-field">
                <label>Phone</label>
                <input value={user.phone} onChange={onUserChange("phone")} />
              </div>
              <div className="biz-field full">
                <label>Password *</label>
                <input
                  type="text"
                  value={user.password}
                  onChange={onUserChange("password")}
                  placeholder="Share offline with the partner"
                />
              </div>
            </div>
          )}
        </div>

        {error && <div className="biz-error">{error}</div>}

        <div className="biz-actions">
          <button type="submit" className="biz-btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Create business"}
          </button>
          <button
            type="button"
            className="biz-btn-secondary"
            onClick={() => navigate("/businesses")}
            disabled={busy}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

export default AddBusiness;
