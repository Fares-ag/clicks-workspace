const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { authLimiter } = require("../middleware/rateLimiter");

// POST /api/auth/login
router.post("/login", authLimiter, authController.login);

// POST /api/auth/logout
router.post("/logout", authController.logout);

// POST /api/auth/forgot-password
router.post("/forgot-password", authLimiter, authController.forgotPassword);

// POST /api/auth/reset-password
router.post("/reset-password", authLimiter, authController.resetPassword);

// POST /api/auth/refresh-token
router.post("/refresh-token", authController.refreshToken);

module.exports = router;
