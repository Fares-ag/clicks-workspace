const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const { requireOps, requireFullAdmin } = require("../middleware/rbac");
const vehicleModelController = require("../controllers/vehicleModelController");

router.get("/", authenticateToken, requireOps, vehicleModelController.getVehicleModels);
router.post("/", authenticateToken, requireFullAdmin, vehicleModelController.createVehicleModel);
router.get(
  "/by-make/:makeId",
  authenticateToken,
  requireOps,
  vehicleModelController.getVehicleModelsByMake
);
router.get(
  "/:id",
  authenticateToken,
  requireOps,
  vehicleModelController.getVehicleModelById
);
router.put(
  "/:id",
  authenticateToken,
  requireFullAdmin,
  vehicleModelController.updateVehicleModel
);
router.delete(
  "/:id",
  authenticateToken,
  requireFullAdmin,
  vehicleModelController.deleteVehicleModel
);

module.exports = router;
