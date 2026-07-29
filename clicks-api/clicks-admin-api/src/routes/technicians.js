const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const { requireOps, requireFullAdmin } = require("../middleware/rbac");
const technicianController = require("../controllers/technicianController");
const upload = require("../middleware/upload");

const technicianFileFields = [
  { name: "profileImage", maxCount: 1 },
  { name: "workPermitFront", maxCount: 1 },
  { name: "workPermitBack", maxCount: 1 },
  { name: "licenseFront", maxCount: 1 },
  { name: "licenseBack", maxCount: 1 }
];

// GET /api/technicians
router.get("/", authenticateToken, requireOps, technicianController.getTechnicians);

// GET /api/technicians/live-map — MUST be before /:id
router.get(
  "/live-map",
  authenticateToken,
  requireOps,
  technicianController.getLiveMapTechnicians
);

// POST /api/technicians
router.post(
  "/",
  authenticateToken,
  upload.fields(technicianFileFields),
  technicianController.createTechnician
);

// GET /api/technicians/:id
router.get("/:id", authenticateToken, technicianController.getTechnicianById);

// PUT /api/technicians/:id
router.put(
  "/:id",
  authenticateToken,
  upload.fields(technicianFileFields),
  technicianController.updateTechnician
);

// DELETE /api/technicians/:id
router.delete("/:id", authenticateToken, requireFullAdmin, technicianController.deleteTechnician);

router.patch(
  "/:id/toggle-active",
  authenticateToken,
  technicianController.toggleActiveStatus
);

// POST /api/technicians/:id/upload-documents
router.post(
  "/:id/upload-documents",
  authenticateToken,
  upload.fields([
    { name: "profilePicture", maxCount: 1 },
    { name: "workPermitFront", maxCount: 1 },
    { name: "workPermitBack", maxCount: 1 },
    { name: "drivingLicenseFront", maxCount: 1 },
    { name: "drivingLicenseBack", maxCount: 1 }
  ]),
  technicianController.uploadDocuments
);

// GET /api/technicians/:id/performance
router.get(
  "/:id/performance",
  authenticateToken,
  technicianController.getPerformance
);

// GET /api/technicians/:id/stats - Job statistics
router.get(
  "/:id/stats",
  authenticateToken,
  technicianController.getTechnicianStats
);

// GET /api/technicians/:id/recent-jobs - Recent jobs
router.get(
  "/:id/recent-jobs",
  authenticateToken,
  technicianController.getRecentJobs
);

// GET /api/technicians/:id/settlements - Balance settlements
router.get(
  "/:id/settlements",
  authenticateToken,
  technicianController.getSettlements
);

// POST /api/technicians/:id/settle-balance - Create settlement (full admin only)
router.post(
  "/:id/settle-balance",
  authenticateToken,
  requireFullAdmin,
  technicianController.settleBalance
);

// PATCH /api/technicians/:id/assign-vehicle - Assign vehicle to technician
router.patch(
  "/:id/assign-vehicle",
  authenticateToken,
  technicianController.assignVehicle
);

module.exports = router;
