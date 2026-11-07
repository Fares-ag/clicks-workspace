const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const { requirePublicSos } = require("../utils/featureFlags");
const serviceRequestController = require("../controllers/serviceRequestController");

/**
 * An "immediate" service request is an emergency by another name, so the
 * same LAUNCH_PUBLIC_SOS switch that turns off SOS must turn it off too
 * (scenario 28). Scheduled bookings are unaffected.
 */
function requirePublicSosForImmediate(req, res, next) {
  if (req.body?.timing === "scheduled") return next();
  return requirePublicSos(req, res, next);
}

router.post(
  "/",
  authenticate(["customer"]),
  requirePublicSosForImmediate,
  serviceRequestController.createServiceRequest
);
router.get(
  "/active",
  authenticate(["customer"]),
  serviceRequestController.getActiveServiceRequest
);
router.post(
  "/:id/cancel",
  authenticate(["customer"]),
  serviceRequestController.cancelServiceRequest
);

module.exports = router;
