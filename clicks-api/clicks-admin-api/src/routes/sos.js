const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const { requireOps, requireFullAdmin } = require("../middleware/rbac");
const sosController = require("../controllers/sosController");

router.get("/", authenticateToken, requireOps, sosController.getSOSRequests);
router.get("/:id", authenticateToken, requireOps, sosController.getSOSById);
router.post("/:id/claim", authenticateToken, requireOps, sosController.claimSOS);
// Supervisor take-over of a claim held by an absent dispatcher (scenario 39).
router.post("/:id/takeover", authenticateToken, requireFullAdmin, sosController.takeoverSOS);
router.post("/:id/schedule", authenticateToken, requireOps, sosController.scheduleSOS);
router.post("/:id/close", authenticateToken, requireOps, sosController.closeSOS);

module.exports = router;
