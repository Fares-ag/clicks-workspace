const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const { requireCustomerMembership } = require("../utils/featureFlags");
const ctrl = require("../controllers/membershipController");

router.get("/plans", authenticate(["customer"]), ctrl.listPlans);
router.get("/me", authenticate(["customer"]), ctrl.listMine);
router.post(
  "/checkout",
  authenticate(["customer"]),
  requireCustomerMembership,
  ctrl.checkout
);
router.get(
  "/:id/status",
  authenticate(["customer"]),
  requireCustomerMembership,
  ctrl.getStatus
);
router.post(
  "/:id/cancel",
  authenticate(["customer"]),
  requireCustomerMembership,
  ctrl.cancelMine
);

module.exports = router;
