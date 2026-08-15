import React from "react";
import { useSelector } from "react-redux";
import "./BusinessTopBar.css";

function BusinessTopBar({ onToggleSidebar }) {
  const user = useSelector((state) => state.auth.user);
  const business = useSelector((state) => state.auth.business);

  const displayName = user?.name || business?.name || "Business user";
  const subtitle =
    business?.name && user?.name && business.name !== user.name
      ? business.name
      : null;

  return (
    <div className="business-topbar">
      <div className="topbar-left">
        <button
          type="button"
          className="sidebar-toggle-btn"
          aria-label="Toggle sidebar"
          onClick={onToggleSidebar}
        >
          <img src="/icons/menu-fries-left.svg" alt="" />
        </button>
      </div>
      <div className="topbar-right">
        <span className="business-avatar" aria-hidden="true" />
        <div className="topbar-user">
          <span className="business-name">{displayName}</span>
          {subtitle && <span className="business-subtitle">{subtitle}</span>}
        </div>
      </div>
    </div>
  );
}

export default BusinessTopBar;
