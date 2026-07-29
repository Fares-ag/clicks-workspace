import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import { logout } from "../store/authSlice";
import PrimaryButton from "./PrimaryButton.jsx";
import "./BusinessSidebar.css";

const navItems = [
  {
    label: "Dashboard",
    icon: "/icons/dashboard.svg",
    to: "/",
    end: true,
  },
  {
    label: "Jobs",
    icon: "/icons/job.svg",
    to: "/jobs",
    end: true,
  },
  {
    label: "New Job",
    icon: "/icons/li-heart-handshake.svg",
    to: "/jobs/new",
  },
];

function BusinessSidebar({ isOpen = true, onNavigate }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleLogout = () => {
    dispatch(logout());
    navigate("/login");
  };

  return (
    <aside className={`business-sidebar${isOpen ? "" : " sidebar-collapsed"}`}>
      <div className="sidebar-logo">
        <NavLink to="/" onClick={onNavigate} end>
          <img src="/logo/Logo.svg" alt="Clicks Logo" className="logo-img" />
        </NavLink>
      </div>
      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
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

export default BusinessSidebar;
