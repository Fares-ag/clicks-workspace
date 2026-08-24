import React from "react";
import { useSelector } from "react-redux";
import "./AdminTopBar.css";

function FinanceTopBar({ onToggleSidebar }) {
  const user = useSelector((state) => state.auth.user);
  const adminName = user?.name || "Finance";

  return (
    <div className="admin-topbar">
      <div className="topbar-left">
        <button
          className="sidebar-toggle-btn"
          aria-label="Toggle sidebar"
          onClick={onToggleSidebar}
          type="button"
        >
          <img src="/icons/menu-fries-left.svg" alt="Open/Close Sidebar" />
        </button>
      </div>
      <div className="topbar-right">
        <span className="admin-avatar" />
        <span className="admin-name">{adminName}</span>
        {user?.role && <span className="admin-role">{user.role}</span>}
        <img className="arrow-down-icon" src="/icons/arrow-down.svg" alt="" />
      </div>
    </div>
  );
}

export default FinanceTopBar;
