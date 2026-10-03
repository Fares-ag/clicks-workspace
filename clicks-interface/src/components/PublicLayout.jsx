import React from "react";
import { Link } from "react-router-dom";
import "./PublicLayout.css";

function PublicLayout({ children }) {
  return (
    <div className="public-layout">
      <header className="public-header">
        <div className="public-header-inner">
          <Link to="/" className="public-logo-link">
            <img src="/logo/SanadLogo.png" alt="Sanad" className="public-logo" />
          </Link>
          <nav className="public-nav">
            <Link to="/privacy-policy" className="public-nav-link">Privacy Policy</Link>
            <Link to="/terms-and-conditions" className="public-nav-link">Terms & Conditions</Link>
            <Link to="/support" className="public-nav-link">Support</Link>
            <Link to="/account-deletion" className="public-nav-link">Delete account</Link>
          </nav>
        </div>
      </header>
      <main className="public-main">
        {children}
      </main>
      <footer className="public-footer">
        <div className="public-footer-inner">
          <span>&copy; {new Date().getFullYear()} Clicks. All rights reserved.</span>
          <div className="public-footer-links">
            <Link to="/privacy-policy">Privacy Policy</Link>
            <Link to="/terms-and-conditions">Terms & Conditions</Link>
            <Link to="/support">Support</Link>
            <Link to="/account-deletion">Delete account</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default PublicLayout;
