const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const { requireFullAdmin } = require("../middleware/rbac");
const performanceController = require("../controllers/performanceController");

router.get("/", authenticateToken, requireFullAdmin, performanceController.getAllPerformance);
router.get(
  "/export-csv",
  authenticateToken,
  requireFullAdmin,
  performanceController.exportPerformanceCSV
);

module.exports = router;
