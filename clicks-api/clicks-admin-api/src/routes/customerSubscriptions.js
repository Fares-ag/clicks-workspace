const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const { requireFullAdmin } = require("../middleware/rbac");
const ctrl = require("../controllers/customerSubscriptionController");

router.get("/", authenticateToken, requireFullAdmin, ctrl.listSubscriptions);
router.get("/:id", authenticateToken, requireFullAdmin, ctrl.getSubscription);

module.exports = router;
