import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import { logout } from "../store/authSlice";
import { useGetSOSRequestsQuery } from "../store/sosApi";
import { useGetServiceRequestsQuery } from "../store/serviceRequestApi";
import PrimaryButton from "./PrimaryButton.jsx";
import "./AdminSidebar.css";

const navItems = [
  {
    label: "Dashboard",
    icon: "/icons/dashboard.svg",
    to: "/dashboard",
  },
  {
    label: "Admin Management",
    icon: "/icons/admin.svg",
    to: "/admin-management",
  },
  {
    label: "Technician Management",
    icon: "/icons/technician.svg",
    to: "/technicians",
  },
  {
    label: "Vehicle Management",
    icon: "/icons/vehicle.svg",
    to: "/vehicles",
  },
  {
    label: "Live Map",
    icon: "/icons/map.svg",
    to: "/live-map",
  },
  {
    label: "Heat Map",
    icon: "/icons/earnings-chart.svg",
    to: "/heat-map",
  },
  {
    label: "Job Management",
    icon: "/icons/job.svg",
    to: "/jobs",
  },
  {
    label: "Business Management",
    icon: "/icons/li-heart-handshake.svg",
    to: "/businesses",
  },
  {
    label: "SOS Inbox",
    icon: "/icons/call.svg",
    to: "/sos",
    badge: "sos",
  },
  {
    label: "Service Requests",
    icon: "/icons/job.svg",
    to: "/service-requests",
    badge: "service",
  },
  {
    label: "Performance",
    icon: "/icons/performance.svg",
    to: "/performance",
  },
  {
    label: "Source Configurator",
    icon: "/icons/configurator.svg",
    to: "/sources",
  },
  {
    label: "Partner Management",
    icon: "/icons/performance.svg",
    to: "/partners",
  },
  {
    label: "Subscriptions",
    icon: "/icons/insurance.svg",
    to: "/vehicle-insurance",
  },
  {
    label: "Support Tickets",
    icon: "/icons/li-heart-handshake.svg",
    to: "/support-tickets",
  },
];

function AdminSidebar({ isOpen = true, onNavigate }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  // Open SOS count (pending + in_call) for red nav badge
  const { data: pendingSos } = useGetSOSRequestsQuery(
    { page: 1, limit: 1, status: "pending" },
    { pollingInterval: 15000 }
  );
  const { data: inCallSos } = useGetSOSRequestsQuery(
    { page: 1, limit: 1, status: "in_call" },
    { pollingInterval: 15000 }
  );
  const sosCount =
    (pendingSos?.pagination?.total || 0) + (inCallSos?.pagination?.total || 0);

  const { data: pendingService } = useGetServiceRequestsQuery(
    { page: 1, limit: 1, status: "pending" },
    { pollingInterval: 15000 }
  );
  const serviceCount = pendingService?.pagination?.total || 0;

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
            {item.badge === "sos" && sosCount > 0 && (
              <span
                className="sidebar-badge"
                aria-label={`${sosCount} open SOS`}
              >
                {sosCount > 99 ? "99+" : sosCount}
              </span>
            )}
            {item.badge === "service" && serviceCount > 0 && (
              <span
                className="sidebar-badge"
                aria-label={`${serviceCount} pending service requests`}
              >
                {serviceCount > 99 ? "99+" : serviceCount}
              </span>
            )}
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

export default AdminSidebar;
