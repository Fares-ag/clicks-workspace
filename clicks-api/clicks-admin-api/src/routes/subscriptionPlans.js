const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const { requireFullAdmin } = require("../middleware/rbac");
const ctrl = require("../controllers/subscriptionPlanController");

router.get("/", authenticateToken, requireFullAdmin, ctrl.listPlans);
router.post("/", authenticateToken, requireFullAdmin, ctrl.createPlan);
// Before /:id so "meta" is never read as a plan id.
router.get("/meta", authenticateToken, requireFullAdmin, ctrl.getPlanMeta);
router.get("/:id", authenticateToken, requireFullAdmin, ctrl.getPlan);
router.patch("/:id", authenticateToken, requireFullAdmin, ctrl.updatePlan);

module.exports = router;
