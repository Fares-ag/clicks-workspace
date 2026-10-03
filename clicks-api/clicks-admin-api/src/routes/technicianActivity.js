const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const { requireFullAdmin } = require("../middleware/rbac");
const controller = require("../controllers/technicianActivityController");

// Full admins only: the trail carries login attempts, IPs and GPS pings, which
// is security data rather than dispatch data (same bar as /api/admins/audit-log).
router.get("/filters", authenticateToken, requireFullAdmin, controller.getTechnicianActivityFilters);
router.get("/summary", authenticateToken, requireFullAdmin, controller.getTechnicianActivitySummary);
router.get("/export", authenticateToken, requireFullAdmin, controller.exportTechnicianActivity);
router.get("/", authenticateToken, requireFullAdmin, controller.listTechnicianActivity);

module.exports = router;
