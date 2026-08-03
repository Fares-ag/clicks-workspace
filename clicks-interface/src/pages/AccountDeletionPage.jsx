import React, { useState } from "react";
import PublicLayout from "../components/PublicLayout.jsx";

function AccountDeletionPage() {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    note: "",
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState("");

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = "Name is required";
    if (!form.phone.trim()) errs.phone = "Registered phone number is required";
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errs.email = "Invalid email address";
    }
    return errs;
  };

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
    setServerError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    setServerError("");
    try {
      const res = await fetch(`${apiBaseUrl}/account-deletion/public`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          appName: "Sanad Technician",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Submission failed");
      setSubmitted(true);
    } catch (err) {
      setServerError(
        err.message ||
          "Something went wrong. Email support@sanad.qa to request deletion."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PublicLayout>
      <div className="public-content-page account-deletion-page">
        <h1>Delete your Sanad Technician account</h1>
        <p className="public-content-subtitle">
          Request deletion of your Sanad Technician app account and associated
          personal data.
        </p>

        <div className="public-content-body">
          <h2>Delete in the app</h2>
          <ol>
            <li>Open the <strong>Sanad Technician</strong> app</li>
            <li>Go to <strong>Settings</strong></li>
            <li>Tap <strong>Delete account</strong> and confirm</li>
          </ol>

          <h2>Request deletion on the web</h2>
          <p>
            If you removed the app or cannot sign in, submit the form below.
            We process requests within <strong>30 days</strong>.
          </p>

          <h3>What we delete</h3>
          <ul>
            <li>Your technician profile (name, phone, email)</li>
            <li>Account credentials and app preferences</li>
            <li>Associated personal data not required for legal or billing records</li>
          </ul>
          <p>
            Some data may be retained where required by law (for example tax,
            fraud prevention, or completed job records). See our{" "}
            <a href="/privacy-policy">Privacy Policy</a>.
          </p>

          <h3>Submit a deletion request</h3>
          {submitted ? (
            <div className="support-success-message">
              <h4>Request received</h4>
              <p>
                We received your account deletion request for Sanad Technician.
                Our team will contact you if we need more information.
              </p>
            </div>
          ) : (
            <>
              {serverError && (
                <div
                  style={{
                    color: "var(--color-text-error)",
                    fontSize: 13,
                    marginBottom: 16,
                  }}
                >
                  {serverError}
                </div>
              )}
              <form onSubmit={handleSubmit} noValidate className="account-deletion-form">
                <div className="support-form-group">
                  <label className="support-form-label">Full name *</label>
                  <input
                    className={`support-form-input${errors.name ? " error" : ""}`}
                    type="text"
                    value={form.name}
                    onChange={handleChange("name")}
                    placeholder="Name on your account"
                  />
                  {errors.name && (
                    <div className="support-form-error">{errors.name}</div>
                  )}
                </div>
                <div className="support-form-group">
                  <label className="support-form-label">
                    Registered phone number *
                  </label>
                  <input
                    className={`support-form-input${errors.phone ? " error" : ""}`}
                    type="tel"
                    value={form.phone}
                    onChange={handleChange("phone")}
                    placeholder="+974..."
                  />
                  {errors.phone && (
                    <div className="support-form-error">{errors.phone}</div>
                  )}
                </div>
                <div className="support-form-group">
                  <label className="support-form-label">Email (optional)</label>
                  <input
                    className={`support-form-input${errors.email ? " error" : ""}`}
                    type="email"
                    value={form.email}
                    onChange={handleChange("email")}
                    placeholder="Email on your account"
                  />
                  {errors.email && (
                    <div className="support-form-error">{errors.email}</div>
                  )}
                </div>
                <div className="support-form-group">
                  <label className="support-form-label">Additional notes</label>
                  <textarea
                    className="support-form-textarea"
                    rows={3}
                    value={form.note}
                    onChange={handleChange("note")}
                    placeholder="Optional details"
                  />
                </div>
                <button
                  type="submit"
                  className="support-form-submit"
                  disabled={submitting}
                >
                  {submitting ? "Submitting..." : "Request account deletion"}
                </button>
              </form>
            </>
          )}

          <p style={{ marginTop: 24 }}>
            Or email{" "}
            <a href="mailto:support@sanad.qa?subject=Sanad%20Technician%20account%20deletion">
              support@sanad.qa
            </a>{" "}
            with the subject &quot;Sanad Technician account deletion&quot;.
          </p>
        </div>
      </div>
    </PublicLayout>
  );
}

export default AccountDeletionPage;
