const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const vehicleModelController = require("../controllers/vehicleModelController");

router.get("/", authenticateToken, vehicleModelController.getVehicleModels);
router.post("/", authenticateToken, vehicleModelController.createVehicleModel);
router.get(
  "/by-make/:makeId",
  authenticateToken,
  vehicleModelController.getVehicleModelsByMake
);
router.get(
  "/:id",
  authenticateToken,
  vehicleModelController.getVehicleModelById
);
router.put(
  "/:id",
  authenticateToken,
  vehicleModelController.updateVehicleModel
);
router.delete(
  "/:id",
  authenticateToken,
  vehicleModelController.deleteVehicleModel
);

module.exports = router;
