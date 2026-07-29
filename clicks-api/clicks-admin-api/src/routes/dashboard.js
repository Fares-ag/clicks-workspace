const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const dashboardController = require("../controllers/dashboardController");

router.get("/summary", authenticateToken, dashboardController.getDashboardSummary);
router.get("/earnings", authenticateToken, dashboardController.getEarningsData);
router.get(
  "/earnings-by-date",
  authenticateToken,
  dashboardController.getEarningsByDate
);
router.get(
  "/job-completion",
  authenticateToken,
  dashboardController.getJobCompletionData
);
router.get(
  "/technician-performance",
  authenticateToken,
  dashboardController.getTechnicianPerformance
);

module.exports = router;
