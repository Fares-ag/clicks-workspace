import React from "react";
import { useSelector } from "react-redux";
import "./AdminTopBar.css";

const AdminTopBar = ({ onToggleSidebar }) => {
  const user = useSelector((state) => state.auth.user);

  // Compose name from firstName/lastName if available, else fallback
  let adminName = "Admin";
  if (user) {
    if (user.firstName || user.lastName) {
      adminName = [user.firstName, user.lastName].filter(Boolean).join(" ");
    } else if (user.name) {
      adminName = user.name;
    } else if (user.fullName) {
      adminName = user.fullName;
    }
  }

  return (
    <div className="admin-topbar">
      <div className="topbar-left">
        <button
          className="sidebar-toggle-btn"
          aria-label="Toggle sidebar"
          onClick={onToggleSidebar}
        >
          <img src="/icons/menu-fries-left.svg" alt="Open/Close Sidebar" />
        </button>
      </div>
      <div className="topbar-right">
        {user && user.profilePicture ? (
          <img className="admin-avatar" src={user.profilePicture} alt="Profile" />
        ) : (
          <span className="admin-avatar" />
        )}
        <span className="admin-name">{adminName}</span>
        <img className="arrow-down-icon" src="/icons/arrow-down.svg" alt="Menu" />
      </div>
    </div>
  );
};

export default AdminTopBar;
