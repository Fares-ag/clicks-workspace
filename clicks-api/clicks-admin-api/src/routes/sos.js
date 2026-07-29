const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const { requireOps } = require("../middleware/rbac");
const sosController = require("../controllers/sosController");

router.get("/", authenticateToken, requireOps, sosController.getSOSRequests);
router.get("/:id", authenticateToken, requireOps, sosController.getSOSById);
router.post("/:id/claim", authenticateToken, requireOps, sosController.claimSOS);

module.exports = router;
