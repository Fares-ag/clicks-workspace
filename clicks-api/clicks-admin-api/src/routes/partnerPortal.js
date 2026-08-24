const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const { authLimiter } = require("../middleware/rateLimiter");
const ctrl = require("../controllers/partnerController");

router.post("/login", authLimiter, ctrl.partnerLogin);
router.get("/me", authenticateToken, ctrl.requirePartner, ctrl.partnerMe);
router.patch(
  "/me",
  authenticateToken,
  ctrl.requirePartner,
  ctrl.partnerUpdateProfile
);
router.post(
  "/change-password",
  authenticateToken,
  ctrl.requirePartner,
  ctrl.partnerChangePassword
);
router.get(
  "/dashboard",
  authenticateToken,
  ctrl.requirePartner,
  ctrl.partnerDashboard
);
router.get(
  "/earnings",
  authenticateToken,
  ctrl.requirePartner,
  ctrl.partnerEarnings
);
router.get(
  "/withdrawals",
  authenticateToken,
  ctrl.requirePartner,
  ctrl.partnerListWithdrawals
);
router.post(
  "/withdrawals",
  authenticateToken,
  ctrl.requirePartner,
  ctrl.partnerCreateWithdrawal
);
router.post(
  "/fcm-token",
  authenticateToken,
  ctrl.requirePartner,
  ctrl.partnerSaveFcmToken
);
router.delete(
  "/fcm-token",
  authenticateToken,
  ctrl.requirePartner,
  ctrl.partnerClearFcmToken
);

module.exports = router;
