const express = require("express");
const router = express.Router();
const customerController = require("../controllers/customerController");
const { authenticate } = require("../middleware/auth");
const { authenticateInternal } = require("../middleware/internalAuth");
const { requirePublicSignup } = require("../utils/featureFlags");
const { authLimiter, otpLimiter, refreshLimiter } = require("../middleware/rateLimiter");

router.post("/register", authLimiter, requirePublicSignup, customerController.register);
router.post("/login", authLimiter, customerController.login);
router.post("/token/refresh", refreshLimiter, customerController.refreshToken);
router.post("/forgot-password", authLimiter, customerController.forgotPassword);
router.post("/verify-reset-otp", otpLimiter, customerController.verifyResetOTP);
router.post("/reset-password", otpLimiter, customerController.resetPassword);
router.post("/otp/send", otpLimiter, requirePublicSignup, customerController.sendRegisterOTP);
router.post("/otp/verify", otpLimiter, requirePublicSignup, customerController.verifyRegisterOTP);
router.post("/fcm-token", authenticate(["customer"]), customerController.saveFcmToken);
router.post("/logout", authenticate(["customer"]), customerController.logout);
router.post("/logout-all", authenticate(["customer"]), customerController.logoutAll);
router.get("/profile", authenticate(["customer"]), customerController.getProfile);
router.post("/update-password", authenticate(["customer"]), customerController.updatePassword);
router.get("/delete-check", authenticate(["customer"]), customerController.deleteCheck);
router.post("/delete", authenticate(["customer"]), customerController.deleteAccount);
router.put("/profile", authenticate(["customer"]), customerController.updateProfile);

/**
 * Internal (admin-api → tech-api): an admin blocked this customer. Drop every
 * live socket in their room so a blocked account stops receiving live events
 * immediately (scenario 14). REST is already refused by `authenticate`.
 */
router.post("/internal/disconnect", authenticateInternal, async (req, res) => {
  const customerId = String(req.body?.customer_id || "");
  if (!/^[0-9a-fA-F]{24}$/.test(customerId)) {
    return res
      .status(400)
      .json({ message: "customer_id is required", code: "CUSTOMER_ID_REQUIRED" });
  }
  const io = req.app.get("io");
  if (!io) {
    return res.status(503).json({ message: "Socket service not initialized" });
  }
  try {
    const nsp = io.of("/customer");
    // Tell the app first, so it shows "contact support" instead of retrying.
    nsp.to(`user:${customerId}`).emit("accountInactive", { code: "ACCOUNT_INACTIVE" });
    nsp.in(`user:${customerId}`).disconnectSockets(true);
    res.json({ message: "Customer sockets disconnected" });
  } catch (error) {
    console.error("customer socket disconnect failed:", error.message);
    res.status(500).json({ message: "Failed to disconnect customer" });
  }
});

module.exports = router;
