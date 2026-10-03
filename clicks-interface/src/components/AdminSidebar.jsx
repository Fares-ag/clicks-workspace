import React, { useMemo } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { logout } from "../store/authSlice";
import { useLogoutMutation } from "../store/authApi";
import { filterNavItemsForRole, useAdminRole } from "../utils/adminRoles";
import { useGetNavBadgesQuery } from "../store/dashboardApi";
import { usePageVisible } from "../hooks/usePageVisible";
import { jobApi } from "../store/jobApi";
import { leadApi } from "../store/leadApi";
import { sosApi } from "../store/sosApi";
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
    label: "Leads",
    icon: "/icons/job.svg",
    to: "/leads",
    badge: "leads",
  },
  {
    label: "Business Management",
    icon: "/icons/li-heart-handshake.svg",
    to: "/businesses",
  },
  {
    label: "Finance",
    icon: "/icons/earnings-chart.svg",
    to: "/finance",
  },
  {
    label: "Finance Users",
    icon: "/icons/admin.svg",
    to: "/finance-users",
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
    label: "Support Tickets",
    icon: "/icons/li-heart-handshake.svg",
    to: "/support-tickets",
  },
  {
    label: "Technician Logs",
    icon: "/icons/performance.svg",
    to: "/technician-logs",
  },
];

function AdminSidebar({ isOpen = true, onNavigate }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const refreshToken = useSelector((state) => state.auth.refreshToken);
  const [logoutMutation] = useLogoutMutation();
  const { role } = useAdminRole();
  const visibleNavItems = useMemo(() => {
    if (!role) return [];
    return filterNavItemsForRole(navItems, role);
  }, [role]);

  const pageVisible = usePageVisible();
  const { data: navBadges } = useGetNavBadgesQuery(undefined, {
    // Socket events already invalidate NavBadges; this is a visibility-aware
    // safety net for counts that change without a socket event.
    pollingInterval: pageVisible ? 45000 : 0,
  });
  const sosCount = navBadges?.sos ?? 0;
  const serviceCount = navBadges?.serviceRequests ?? 0;
  const leadsCount = navBadges?.openLeads ?? 0;

  const prefetchNav = (to) => {
    if (to === "/jobs") {
      dispatch(jobApi.util.prefetch("getJobs", { page: 1, limit: 40, search: "" }, { force: false }));
    } else if (to === "/leads") {
      dispatch(leadApi.util.prefetch("getLeads", { page: 1, limit: 15, search: "" }, { force: false }));
    } else if (to === "/sos") {
      dispatch(sosApi.util.prefetch("getSOSRequests", { page: 1, limit: 15, search: "" }, { force: false }));
    }
  };

  const handleLogout = async () => {
    try {
      if (refreshToken) {
        await Promise.race([
          logoutMutation({ refreshToken }).unwrap(),
          new Promise((resolve) => setTimeout(resolve, 2000)),
        ]);
      }
    } catch {
      // Server unreachable — still clear local session.
    }
    dispatch(logout());
    navigate("/login");
  };

  return (
    <aside className={`admin-sidebar${isOpen ? "" : " sidebar-collapsed"}`}>
      <div className="sidebar-logo">
        <NavLink to="/dashboard" onClick={onNavigate}>
          <img src="/logo/SanadLogo.png" alt="Sanad" className="logo-img" />
        </NavLink>
      </div>
      <nav className="sidebar-nav">
        {visibleNavItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onMouseEnter={() => prefetchNav(item.to)}
            onFocus={() => prefetchNav(item.to)}
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
            {item.badge === "leads" && leadsCount > 0 && (
              <span
                className="sidebar-badge"
                aria-label={`${leadsCount} open leads`}
              >
                {leadsCount > 99 ? "99+" : leadsCount}
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
