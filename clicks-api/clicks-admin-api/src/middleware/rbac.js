/**
 * Minimal admin RBAC.
 * Super Admin / Admin: full access (admin CRUD, partners, businesses, config, finance, deletes)
 * Job Dispatcher / Coordinator / Call Center Agent: ops workflow only
 * (jobs, SOS, service requests, leads, techs, vehicles, live map, clients, support tickets)
 */

const FULL_ACCESS = new Set(["Super Admin", "Admin"]);
const OPS_ACCESS = new Set([
  "Super Admin",
  "Admin",
  "Job Dispatcher",
  "Coordinator",
  "Call Center Agent",
]);

function requireRoles(allowedRoles = []) {
  const allowed = new Set(allowedRoles);
  return (req, res, next) => {
    const role = req.user?.role;
    if (!role || !allowed.has(role)) {
      return res.status(403).json({ message: "Forbidden for this role" });
    }
    next();
  };
}

const requireFullAdmin = requireRoles([...FULL_ACCESS]);
const requireOps = requireRoles([...OPS_ACCESS]);

module.exports = {
  FULL_ACCESS,
  OPS_ACCESS,
  requireRoles,
  requireFullAdmin,
  requireOps,
};
