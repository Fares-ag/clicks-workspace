const { Technician } = require("../../../clicks-shared/models");
const { objectId } = require("../../../clicks-shared/utils/coerce");

const APPROVAL_TTL_MS = 15000;
const approvalCache = new Map();

function approvalCacheGet(id) {
  const hit = approvalCache.get(id);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    approvalCache.delete(id);
    return null;
  }
  return hit;
}

function approvalCacheSet(id, value) {
  if (approvalCache.size > 500) {
    const first = approvalCache.keys().next().value;
    approvalCache.delete(first);
  }
  approvalCache.set(id, { ...value, expiresAt: Date.now() + APPROVAL_TTL_MS });
}

/**
 * Re-check the technician's account state on every privileged request.
 *
 * The JWT carries nothing but {id, role} and lives for 7 days, so on its own it
 * keeps working after an admin rejects the application or the account is
 * deactivated (POST /api/technicians/delete only flips isActive). This — not
 * token issuance — is the approval boundary: it must be wired into every
 * technician-role route, so a token handed out before the change stops working
 * on the next request.
 *
 * Runs after authenticate(["technician"]), so req.user is already populated.
 */
const requireApprovedTechnician = async (req, res, next) => {
  try {
    const techId = objectId(req.user && req.user.id);
    if (!techId) {
      return res.status(401).json({ error: "Invalid token" });
    }
    const cacheId = String(techId);
    const cached = approvalCacheGet(cacheId);
    if (cached) {
      if (!cached.ok) {
        return res.status(cached.status).json(cached.body);
      }
      return next();
    }
    const technician = await Technician.findById(techId).select(
      "applicationStatus isActive"
    );
    if (!technician) {
      approvalCacheSet(cacheId, {
        ok: false,
        status: 401,
        body: { error: "Technician not found" },
      });
      return res.status(401).json({ error: "Technician not found" });
    }
    if (technician.isActive === false) {
      const body = { error: "This account has been deactivated" };
      approvalCacheSet(cacheId, { ok: false, status: 403, body });
      return res.status(403).json(body);
    }
    if (technician.applicationStatus !== "Approved") {
      const body = {
        error: "Your application has not been approved yet",
        applicationStatus: technician.applicationStatus,
      };
      approvalCacheSet(cacheId, { ok: false, status: 403, body });
      return res.status(403).json(body);
    }
    approvalCacheSet(cacheId, { ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Authorization check failed" });
  }
  // Outside the try: a synchronous throw further down the chain must not be
  // answered a second time by the catch above.
  next();
};

/**
 * Same check, but only for technician callers. For routes shared with customers
 * (authenticate(["customer", "technician"])) a customer token passes straight
 * through, while a rejected or deactivated technician is stopped.
 */
const requireApprovedTechnicianIfTechnician = (req, res, next) => {
  if (!req.user || req.user.role !== "technician") {
    return next();
  }
  return requireApprovedTechnician(req, res, next);
};

module.exports = { requireApprovedTechnician, requireApprovedTechnicianIfTechnician };
