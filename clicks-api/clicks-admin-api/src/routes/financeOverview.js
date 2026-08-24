const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const { requireFullAdmin } = require("../middleware/rbac");
const financeOverviewController = require("../controllers/financeOverviewController");

// Read-only mirror of the finance portal's figures for full admins. The finance
// portal (mounted at /api/finance) remains the only place they can be edited.
router.get("/summary", authenticateToken, requireFullAdmin, financeOverviewController.getSummary);
router.get("/jobs", authenticateToken, requireFullAdmin, financeOverviewController.listJobs);

module.exports = router;
