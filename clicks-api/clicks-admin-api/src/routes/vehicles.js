const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const vehicleController = require("../controllers/vehicleController");
const upload = require("../middleware/upload");

router.get("/", authenticateToken, vehicleController.getVehicles);

router.post(
  "/",
  authenticateToken,
  upload.fields([
    { name: "vehicleImage", maxCount: 1 },
    { name: "estimaraFront", maxCount: 1 },
    { name: "estimaraBack", maxCount: 1 },
  ]),
  vehicleController.createVehicle
);

router.get("/:id", authenticateToken, vehicleController.getVehicleById);

router.put(
  "/:id",
  authenticateToken,
  upload.fields([
    { name: "vehicleImage", maxCount: 1 },
    { name: "estimaraFront", maxCount: 1 },
    { name: "estimaraBack", maxCount: 1 },
  ]),
  vehicleController.updateVehicle
);

router.delete("/:id", authenticateToken, vehicleController.deleteVehicle);

router.patch(
  "/:id/toggle-active",
  authenticateToken,
  vehicleController.toggleActiveStatus
);

router.patch(
  "/:id/unassign-technician",
  authenticateToken,
  vehicleController.unassignTechnician
);

router.post(
  "/:id/upload-documents",
  authenticateToken,
  upload.fields([
    { name: "vehicleImage", maxCount: 1 },
    { name: "estimaraFront", maxCount: 1 },
    { name: "estimaraBack", maxCount: 1 },
  ]),
  vehicleController.uploadDocuments
);

module.exports = router;
