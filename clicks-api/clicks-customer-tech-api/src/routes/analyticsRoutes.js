const express = require("express");
const router = express.Router();
const analyticsController = require("../controllers/analyticsController");
const { authenticate } = require("../middleware/auth");

router.get("/earnings", authenticate(["technician"]), analyticsController.getTechnicianEarnings);
router.get("/performance", authenticate(["technician"]), analyticsController.getPerformanceMetrics);
router.get("/weekly", authenticate(["technician"]), analyticsController.getWeeklyStats);
router.get("/jobs", authenticate(["technician"]), analyticsController.getJobStatistics);

module.exports = router;
