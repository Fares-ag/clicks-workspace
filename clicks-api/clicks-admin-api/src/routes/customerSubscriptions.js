const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const { requireFullAdmin } = require("../middleware/rbac");
const ctrl = require("../controllers/customerSubscriptionController");

const fullAdmin = [authenticateToken, requireFullAdmin];

router.get("/", ...fullAdmin, ctrl.listSubscriptions);
// Grant / comp a membership (no payment).
router.post("/", ...fullAdmin, ctrl.grantSubscription);
router.get("/:id", ...fullAdmin, ctrl.getSubscription);
router.post("/:id/extend", ...fullAdmin, ctrl.extendSubscription);
// { mode: "period_end" | "immediate", reason }
router.post("/:id/cancel", ...fullAdmin, ctrl.cancelSubscription);
// Opens a refund case; approval happens under /api/payments/refunds/:id/approve.
router.post("/:id/refund", ...fullAdmin, ctrl.refundSubscription);
router.post("/:id/usage", ...fullAdmin, ctrl.adjustUsage);

module.exports = router;
