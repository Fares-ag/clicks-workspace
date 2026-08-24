import { useSelector } from "react-redux";
import { getEffectiveRole, normalizeRole } from "./authRole";
export const FULL_ADMIN_ROLES = ["Super Admin", "Admin"];

/** Ops roles: dispatch / call-center workflow without admin config. */
export const OPS_ROLES = [
  "Super Admin",
  "Admin",
  "Job Dispatcher",
  "Coordinator",
  "Call Center Agent",
];

/** Route prefixes restricted to full admins only. */
export const FULL_ADMIN_ONLY_PREFIXES = [
  "/admin-management",
  "/heat-map",
  "/performance",
  "/sources",
  "/businesses",
  "/finance-users",
  "/partners",
  "/vehicle-makes",
  "/vehicle-models",
  "/calls",
];

/** Route prefixes allowed for ops roles (Job Dispatcher, etc.). */
export const OPS_ALLOWED_PREFIXES = [
  "/dashboard",
  "/technicians",
  "/vehicles",
  "/live-map",
  "/jobs",
  "/leads",
  "/sos",
  "/service-requests",
  "/clients",
  "/support-tickets",
];

export function isFullAdmin(role) {
  return FULL_ADMIN_ROLES.includes(role);
}

export function isOpsRole(role) {
  return OPS_ROLES.includes(role);
}

export function canAccessPath(role, pathname = "") {
  const normalizedRole = normalizeRole(role);
  if (!normalizedRole) return false;
  if (isFullAdmin(normalizedRole)) return true;
  if (!isOpsRole(normalizedRole)) return false;

  const path = pathname.split("?")[0];

  if (FULL_ADMIN_ONLY_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return false;
  }

  return OPS_ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export function filterNavItemsForRole(navItems, role) {
  return navItems.filter((item) => canAccessPath(role, item.to));
}

export function useAdminRole() {
  const user = useSelector((state) => state.auth.user);
  const token = useSelector((state) => state.auth.token);
  const role = getEffectiveRole(user, token);
  return {
    role,
    isFullAdmin: isFullAdmin(role),
    isOps: isOpsRole(role),
  };
}
