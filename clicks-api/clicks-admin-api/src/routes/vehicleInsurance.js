const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const { requireOps, requireFullAdmin } = require("../middleware/rbac");
const vehicleInsuranceController = require("../controllers/vehicleInsuranceController");

router.get(
  "/",
  authenticateToken,
  requireOps,
  vehicleInsuranceController.getVehicleInsurances
);
router.post(
  "/",
  authenticateToken,
  requireFullAdmin,
  vehicleInsuranceController.createVehicleInsurance
);
router.get(
  "/:id",
  authenticateToken,
  requireOps,
  vehicleInsuranceController.getVehicleInsuranceById
);
router.put(
  "/:id",
  authenticateToken,
  requireFullAdmin,
  vehicleInsuranceController.updateVehicleInsurance
);
router.delete(
  "/:id",
  authenticateToken,
  requireFullAdmin,
  vehicleInsuranceController.deleteVehicleInsurance
);

module.exports = router;
