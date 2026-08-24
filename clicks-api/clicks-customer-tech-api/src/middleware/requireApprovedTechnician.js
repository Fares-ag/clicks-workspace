const { Technician } = require("../../../clicks-shared/models");
const { objectId } = require("../../../clicks-shared/utils/coerce");

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
    const technician = await Technician.findById(techId).select(
      "applicationStatus isActive"
    );
    if (!technician) {
      return res.status(401).json({ error: "Technician not found" });
    }
    if (technician.isActive === false) {
      return res.status(403).json({ error: "This account has been deactivated" });
    }
    if (technician.applicationStatus !== "Approved") {
      return res.status(403).json({
        error: "Your application has not been approved yet",
        applicationStatus: technician.applicationStatus,
      });
    }
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
