const express = require("express");
const router = express.Router();
const authenticateBusiness = require("../middleware/authenticateBusiness");
const businessPortalController = require("../controllers/businessPortalController");
const businessDashboardController = require("../controllers/businessDashboardController");

// Public
router.post("/auth/login", businessPortalController.login);

// Authenticated business portal
router.get("/me", authenticateBusiness, businessPortalController.me);
router.get("/dashboard", authenticateBusiness, businessPortalController.dashboard);
router.get(
  "/dashboard/summary",
  authenticateBusiness,
  businessDashboardController.getSummary
);
router.get(
  "/dashboard/earnings",
  authenticateBusiness,
  businessDashboardController.getEarningsData
);
router.get(
  "/dashboard/job-completion",
  authenticateBusiness,
  businessDashboardController.getJobCompletionData
);
router.get(
  "/dashboard/technician-performance",
  authenticateBusiness,
  businessDashboardController.getTechnicianPerformance
);
router.get(
  "/dashboard/earnings-by-date",
  authenticateBusiness,
  businessDashboardController.getEarningsByDate
);
router.get("/analytics", authenticateBusiness, businessPortalController.analytics);
router.get(
  "/vehicle-makes",
  authenticateBusiness,
  businessPortalController.listVehicleMakes
);
router.get(
  "/vehicle-models/by-make/:makeId",
  authenticateBusiness,
  businessPortalController.listVehicleModelsByMake
);
router.get("/jobs", authenticateBusiness, businessPortalController.listJobs);
router.post("/jobs", authenticateBusiness, businessPortalController.createJob);
router.get("/jobs/:id", authenticateBusiness, businessPortalController.getJobById);

module.exports = router;
