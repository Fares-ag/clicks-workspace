import DOMPurify from "dompurify";
import React, { useState, useEffect } from "react";
import PublicLayout from "../components/PublicLayout.jsx";

function TermsAndConditionsPage() {
  const [terms, setTerms] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;

  const fetchTerms = async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`${apiBaseUrl}/terms-and-conditions/active`);
      if (!res.ok) throw new Error("Not found");
      const data = await res.json();
      setTerms(data.terms);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTerms();
  }, []);

  return (
    <PublicLayout>
      <div className="public-content-page">
        {loading && (
          <div className="public-content-loading">
            <div className="spinner" />
            <p>Loading terms and conditions...</p>
          </div>
        )}

        {error && !loading && (
          <div className="public-content-error">
            <h2>Terms & Conditions Unavailable</h2>
            <p>The terms and conditions are currently unavailable. Please try again later.</p>
            <button onClick={fetchTerms}>Try Again</button>
          </div>
        )}

        {!loading && !error && terms && (
          <>
            <h1>Terms & Conditions</h1>
            <div className="public-content-subtitle">
              Version {terms.version} — Effective {new Date(terms.effectiveDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
            </div>
            <div
              className="public-content-body"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(terms.content),
              }}
            />
          </>
        )}

        {!loading && !error && !terms && (
          <div className="public-content-error">
            <h2>No Terms & Conditions Found</h2>
            <p>There are no active terms and conditions at this time.</p>
          </div>
        )}
      </div>
    </PublicLayout>
  );
}

export default TermsAndConditionsPage;
