const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const vehicleInsuranceController = require("../controllers/vehicleInsuranceController");

router.get(
  "/",
  authenticateToken,
  vehicleInsuranceController.getVehicleInsurances
);
router.post(
  "/",
  authenticateToken,
  vehicleInsuranceController.createVehicleInsurance
);
router.get(
  "/:id",
  authenticateToken,
  vehicleInsuranceController.getVehicleInsuranceById
);
router.put(
  "/:id",
  authenticateToken,
  vehicleInsuranceController.updateVehicleInsurance
);
router.delete(
  "/:id",
  authenticateToken,
  vehicleInsuranceController.deleteVehicleInsurance
);

module.exports = router;
