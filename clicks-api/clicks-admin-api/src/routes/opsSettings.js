const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const { requireFullAdmin } = require("../middleware/rbac");
const opsSettingsController = require("../controllers/opsSettingsController");

router.get("/", authenticateToken, requireFullAdmin, opsSettingsController.getOpsSettings);
router.put("/", authenticateToken, requireFullAdmin, opsSettingsController.updateOpsSettings);

module.exports = router;
