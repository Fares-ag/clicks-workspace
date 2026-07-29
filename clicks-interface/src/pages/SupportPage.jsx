import React, { useState } from "react";
import PublicLayout from "../components/PublicLayout.jsx";

const ISSUE_TYPES = [
  "Technical Issue",
  "Emergency Service Requests",
  "Billing & Payments",
  "Technician Dispute",
  "General Inquiry"
];

function SupportPage() {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    issue: "",
    description: ""
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState("");

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = "Name is required";
    if (!form.email.trim()) errs.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = "Invalid email address";
    if (!form.issue) errs.issue = "Please select an issue type";
    if (!form.description.trim()) errs.description = "Description is required";
    else if (form.description.trim().length < 10) errs.description = "Please add at least 10 characters";
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
      const res = await fetch(`${apiBaseUrl}/contact-us/public`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Submission failed");
      setSubmitted(true);
    } catch (err) {
      setServerError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setForm({ name: "", email: "", phone: "", issue: "", description: "" });
    setErrors({});
    setSubmitted(false);
    setServerError("");
  };

  return (
    <PublicLayout>
      <div className="public-support-page">
        {/* Left — Info Panel */}
        <div className="public-support-info">
          <h1>Get in Touch</h1>
          <p>
            Have a question, concern, or need help with our services? 
            We're here to assist you. Fill out the form and our support team 
            will get back to you as soon as possible.
          </p>

          <div className="support-contact-item">
            <div className="support-contact-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
            </div>
            <span>+974 7009 0220</span>
          </div>

          <div className="support-contact-item">
            <div className="support-contact-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
            </div>
            <span>support@sanad.qa</span>
          </div>

          <div className="support-contact-item">
            <div className="support-contact-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
            </div>
            <span>Doha, Qatar</span>
          </div>
        </div>

        {/* Right — Form */}
        <div className="public-support-form-card">
          {submitted ? (
            <div className="support-success-message">
              <div className="support-success-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <h3>Request Submitted!</h3>
              <p>Thank you for reaching out. Our support team will review your request and get back to you shortly.</p>
              <button onClick={handleReset}>Submit Another Request</button>
            </div>
          ) : (
            <>
              <h2>Submit a Support Request</h2>

              {serverError && (
                <div style={{ color: "var(--color-text-error)", fontSize: 13, marginBottom: 16 }}>
                  {serverError}
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate>
                <div className="support-form-group">
                  <label className="support-form-label">Full Name *</label>
                  <input
                    className={`support-form-input${errors.name ? " error" : ""}`}
                    type="text"
                    placeholder="Enter your full name"
                    value={form.name}
                    onChange={handleChange("name")}
                  />
                  {errors.name && <div className="support-form-error">{errors.name}</div>}
                </div>

                <div className="support-form-group">
                  <label className="support-form-label">Email Address *</label>
                  <input
                    className={`support-form-input${errors.email ? " error" : ""}`}
                    type="email"
                    placeholder="Enter your email address"
                    value={form.email}
                    onChange={handleChange("email")}
                  />
                  {errors.email && <div className="support-form-error">{errors.email}</div>}
                </div>

                <div className="support-form-group">
                  <label className="support-form-label">Phone Number</label>
                  <input
                    className="support-form-input"
                    type="tel"
                    placeholder="Enter your phone number (optional)"
                    value={form.phone}
                    onChange={handleChange("phone")}
                  />
                </div>

                <div className="support-form-group">
                  <label className="support-form-label">Issue Type *</label>
                  <select
                    className={`support-form-select${errors.issue ? " error" : ""}`}
                    value={form.issue}
                    onChange={handleChange("issue")}
                  >
                    <option value="">Select an issue type</option>
                    {ISSUE_TYPES.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                  {errors.issue && <div className="support-form-error">{errors.issue}</div>}
                </div>

                <div className="support-form-group">
                  <label className="support-form-label">Description *</label>
                  <textarea
                    className={`support-form-textarea${errors.description ? " error" : ""}`}
                    placeholder="Describe your issue in detail..."
                    value={form.description}
                    onChange={handleChange("description")}
                    rows={5}
                  />
                  {errors.description && <div className="support-form-error">{errors.description}</div>}
                </div>

                <button
                  type="submit"
                  className="support-form-submit"
                  disabled={submitting}
                >
                  {submitting ? "Submitting..." : "Submit Request"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </PublicLayout>
  );
}

export default SupportPage;
