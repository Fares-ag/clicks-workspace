const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const {
  getVehicleTypes,
  getActiveVehicleTypes,
  createVehicleType,
  updateVehicleType,
  deleteVehicleType,
} = require("../controllers/vehicleTypeController");

router.get("/active", getActiveVehicleTypes); // public catalog
router.get("/", authenticateToken, getVehicleTypes);
router.post("/", authenticateToken, createVehicleType);
router.put("/:id", authenticateToken, updateVehicleType);
router.delete("/:id", authenticateToken, deleteVehicleType);

module.exports = router;
