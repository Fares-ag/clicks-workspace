const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const { requireOps, requireFullAdmin } = require("../middleware/rbac");
const dashboardController = require("../controllers/dashboardController");

router.get("/nav-badges", authenticateToken, requireOps, dashboardController.getNavBadges);
router.get("/summary", authenticateToken, requireOps, dashboardController.getDashboardSummary);
router.get("/earnings", authenticateToken, requireFullAdmin, dashboardController.getEarningsData);
router.get(
  "/earnings-by-date",
  authenticateToken,
  requireFullAdmin,
  dashboardController.getEarningsByDate
);
router.get(
  "/job-completion",
  authenticateToken,
  requireOps,
  dashboardController.getJobCompletionData
);
router.get(
  "/technician-performance",
  authenticateToken,
  requireFullAdmin,
  dashboardController.getTechnicianPerformance
);

module.exports = router;
