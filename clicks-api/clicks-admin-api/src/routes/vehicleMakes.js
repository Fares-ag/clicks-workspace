const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const { requireOps, requireFullAdmin } = require("../middleware/rbac");
const vehicleMakeController = require("../controllers/vehicleMakeController");

router.get("/", authenticateToken, requireOps, vehicleMakeController.getVehicleMakes);
router.post("/", authenticateToken, requireFullAdmin, vehicleMakeController.createVehicleMake);
router.get(
  "/:id",
  authenticateToken,
  requireOps,
  vehicleMakeController.getVehicleMakeById
);
router.put(
  "/:id",
  authenticateToken,
  requireFullAdmin,
  vehicleMakeController.updateVehicleMake
);
router.delete(
  "/:id",
  authenticateToken,
  requireFullAdmin,
  vehicleMakeController.deleteVehicleMake
);

module.exports = router;
