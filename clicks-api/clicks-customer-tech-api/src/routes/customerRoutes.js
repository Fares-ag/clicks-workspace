const express = require("express");
const router = express.Router();
const customerController = require("../controllers/customerController");
const { authenticate } = require("../middleware/auth");
const { requirePublicSignup } = require("../utils/featureFlags");
const { authLimiter, otpLimiter } = require("../middleware/rateLimiter");

router.post("/register", authLimiter, requirePublicSignup, customerController.register);
router.post("/login", authLimiter, customerController.login);
router.post("/forgot-password", authLimiter, customerController.forgotPassword);
router.post("/verify-reset-otp", otpLimiter, customerController.verifyResetOTP);
router.post("/reset-password", otpLimiter, customerController.resetPassword);
router.post("/otp/send", otpLimiter, requirePublicSignup, customerController.sendRegisterOTP);
router.post("/otp/verify", otpLimiter, requirePublicSignup, customerController.verifyRegisterOTP);
router.post("/fcm-token", authenticate(["customer"]), customerController.saveFcmToken);
router.post("/logout", authenticate(["customer"]), customerController.logout);
router.get("/profile", authenticate(["customer"]), customerController.getProfile);
router.post("/update-password", authenticate(["customer"]), customerController.updatePassword);
router.post("/delete", authenticate(["customer"]), customerController.deleteAccount);
router.put("/profile", authenticate(["customer"]), customerController.updateProfile);

module.exports = router;
