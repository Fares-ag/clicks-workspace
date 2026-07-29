const express = require("express");
const router = express.Router();
const vehicleController = require("../controllers/vehicleController");
const { authenticate } = require("../middleware/auth");

router.post("/", authenticate(["customer"]), vehicleController.addVehicle);
router.get("/", authenticate(["customer"]), vehicleController.getVehicles);
router.get("/makes", vehicleController.getVehicleMakes);
router.get("/models", vehicleController.getVehicleModels);
router.get("/types", vehicleController.getVehicleTypes);
router.put("/:id", authenticate(["customer"]), vehicleController.updateVehicle);
router.delete("/:id", authenticate(["customer"]), vehicleController.deleteVehicle);

module.exports = router;
