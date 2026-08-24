import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import { logout } from "../store/authSlice";
import PrimaryButton from "./PrimaryButton.jsx";
import "./AdminSidebar.css";

const navItems = [
  { label: "Dashboard", icon: "/icons/dashboard.svg", to: "/dashboard" },
  { label: "Jobs", icon: "/icons/job.svg", to: "/jobs" },
  { label: "Vendors", icon: "/icons/user.svg", to: "/vendors" },
  { label: "Purchases", icon: "/icons/job.svg", to: "/purchases" },
];

function FinanceSidebar({ isOpen = true, onNavigate }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleLogout = () => {
    dispatch(logout());
    navigate("/login");
  };

  return (
    <aside className={`admin-sidebar${isOpen ? "" : " sidebar-collapsed"}`}>
      <div className="sidebar-logo">
        <NavLink to="/dashboard" onClick={onNavigate}>
          <img src="/logo/Logo.svg" alt="Clicks Logo" className="logo-img" />
        </NavLink>
      </div>
      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              "sidebar-nav-item" + (isActive ? " active" : "")
            }
          >
            <img
              src={item.icon}
              alt={item.label + " icon"}
              className="sidebar-icon"
            />
            <span className="sidebar-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-bottom-container">
        <PrimaryButton width="100%" height="44px" onClick={handleLogout}>
          Logout
        </PrimaryButton>
      </div>
    </aside>
  );
}

export default FinanceSidebar;
