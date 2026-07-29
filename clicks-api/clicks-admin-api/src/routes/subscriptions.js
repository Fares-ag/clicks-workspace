const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const { requireFullAdmin } = require("../middleware/rbac");
const ctrl = require("../controllers/subscriptionController");

router.get("/lookup", authenticateToken, ctrl.lookupByPlate);
router.get("/", authenticateToken, requireFullAdmin, ctrl.listSubscriptions);
router.post("/", authenticateToken, requireFullAdmin, ctrl.createSubscription);
router.get("/:id", authenticateToken, requireFullAdmin, ctrl.getSubscription);
router.patch("/:id", authenticateToken, requireFullAdmin, ctrl.updateSubscription);
router.post("/:id/cancel", authenticateToken, requireFullAdmin, ctrl.cancelSubscription);

module.exports = router;
