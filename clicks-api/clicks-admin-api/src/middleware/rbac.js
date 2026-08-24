/**
 * Minimal admin RBAC.
 * Super Admin / Admin: full access (admin CRUD, partners, businesses, config, finance, deletes)
 * Job Dispatcher / Coordinator / Call Center Agent: ops workflow only
 * (jobs, SOS, service requests, leads, techs, vehicles, live map, clients, support tickets)
 */

const Admin = require("../models/Admin");

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
  return async (req, res, next) => {
    const role = req.user?.role;
    if (!role || !allowed.has(role)) {
      return res.status(403).json({ message: "Forbidden for this role" });
    }

    // The role claim alone is not proof: several portals mint tokens with the
    // same JWT_SECRET, and a token stays valid for its full lifetime, so a
    // deactivated or deleted admin kept full-fleet access (including live GPS)
    // until it expired. The socket side already verifies this; REST did not.
    //
    // Note: this deliberately lives here rather than in authenticateToken,
    // which is also used by the partner portal where the subject is a Partner
    // and no Admin document exists.
    const adminId = req.user?.id;
    if (!adminId) {
      return res.status(403).json({ message: "Forbidden for this role" });
    }

    try {
      const isActiveAdmin = await Admin.exists({ _id: adminId, isActive: true });
      if (!isActiveAdmin) {
        return res.status(403).json({ message: "Forbidden for this role" });
      }
    } catch {
      return res.status(500).json({ message: "Authorization check failed" });
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
