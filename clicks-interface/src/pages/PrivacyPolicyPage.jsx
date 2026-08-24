import DOMPurify from "dompurify";
import React, { useState, useEffect } from "react";
import PublicLayout from "../components/PublicLayout.jsx";

function PrivacyPolicyPage() {
  const [policy, setPolicy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;

  const fetchPolicy = async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`${apiBaseUrl}/privacy-policy/active`);
      if (!res.ok) throw new Error("Not found");
      const data = await res.json();
      setPolicy(data.policy);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPolicy();
  }, []);

  return (
    <PublicLayout>
      <div className="public-content-page">
        {loading && (
          <div className="public-content-loading">
            <div className="spinner" />
            <p>Loading privacy policy...</p>
          </div>
        )}

        {error && !loading && (
          <div className="public-content-error">
            <h2>Privacy Policy Unavailable</h2>
            <p>The privacy policy is currently unavailable. Please try again later.</p>
            <button onClick={fetchPolicy}>Try Again</button>
          </div>
        )}

        {!loading && !error && policy && (
          <>
            <h1>Privacy Policy</h1>
            <div className="public-content-subtitle">
              Version {policy.version} — Effective {new Date(policy.effectiveDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
            </div>
            <div
              className="public-content-body"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(policy.content),
              }}
            />
          </>
        )}

        {!loading && !error && !policy && (
          <div className="public-content-error">
            <h2>No Privacy Policy Found</h2>
            <p>There is no active privacy policy at this time.</p>
          </div>
        )}
      </div>
    </PublicLayout>
  );
}

export default PrivacyPolicyPage;
