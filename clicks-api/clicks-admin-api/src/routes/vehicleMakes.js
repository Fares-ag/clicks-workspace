const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const vehicleMakeController = require("../controllers/vehicleMakeController");

router.get("/", authenticateToken, vehicleMakeController.getVehicleMakes);
router.post("/", authenticateToken, vehicleMakeController.createVehicleMake);
router.get(
  "/:id",
  authenticateToken,
  vehicleMakeController.getVehicleMakeById
);
router.put(
  "/:id",
  authenticateToken,
  vehicleMakeController.updateVehicleMake
);
router.delete(
  "/:id",
  authenticateToken,
  vehicleMakeController.deleteVehicleMake
);

module.exports = router;
