const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const performanceController = require("../controllers/performanceController");

router.get("/", authenticateToken, performanceController.getAllPerformance);
router.get(
  "/export-csv",
  authenticateToken,
  performanceController.exportPerformanceCSV
);

module.exports = router;
