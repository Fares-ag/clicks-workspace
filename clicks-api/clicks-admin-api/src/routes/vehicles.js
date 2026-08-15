const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const { requireOps, requireFullAdmin } = require("../middleware/rbac");
const vehicleController = require("../controllers/vehicleController");
const upload = require("../middleware/upload");

router.get("/", authenticateToken, requireOps, vehicleController.getVehicles);

router.post(
  "/",
  authenticateToken,
  requireOps,
  upload.fields([
    { name: "vehicleImage", maxCount: 1 },
    { name: "estimaraFront", maxCount: 1 },
    { name: "estimaraBack", maxCount: 1 },
  ]),
  vehicleController.createVehicle
);

router.get("/:id", authenticateToken, requireOps, vehicleController.getVehicleById);

router.put(
  "/:id",
  authenticateToken,
  requireOps,
  upload.fields([
    { name: "vehicleImage", maxCount: 1 },
    { name: "estimaraFront", maxCount: 1 },
    { name: "estimaraBack", maxCount: 1 },
  ]),
  vehicleController.updateVehicle
);

router.delete("/:id", authenticateToken, requireFullAdmin, vehicleController.deleteVehicle);

router.patch(
  "/:id/toggle-active",
  authenticateToken,
  requireOps,
  vehicleController.toggleActiveStatus
);

router.patch(
  "/:id/unassign-technician",
  authenticateToken,
  requireOps,
  vehicleController.unassignTechnician
);

router.post(
  "/:id/upload-documents",
  authenticateToken,
  requireOps,
  upload.fields([
    { name: "vehicleImage", maxCount: 1 },
    { name: "estimaraFront", maxCount: 1 },
    { name: "estimaraBack", maxCount: 1 },
  ]),
  vehicleController.uploadDocuments
);

module.exports = router;
