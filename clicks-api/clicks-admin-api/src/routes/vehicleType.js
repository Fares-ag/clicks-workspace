const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const { requireOps, requireFullAdmin } = require("../middleware/rbac");
const {
  getVehicleTypes,
  getActiveVehicleTypes,
  createVehicleType,
  updateVehicleType,
  deleteVehicleType,
} = require("../controllers/vehicleTypeController");

router.get("/active", getActiveVehicleTypes); // public catalog
router.get("/", authenticateToken, requireOps, getVehicleTypes);
router.post("/", authenticateToken, requireFullAdmin, createVehicleType);
router.put("/:id", authenticateToken, requireFullAdmin, updateVehicleType);
router.delete("/:id", authenticateToken, requireFullAdmin, deleteVehicleType);

module.exports = router;
