const rateLimit = require("express-rate-limit");

/**
 * Strict limiter for admin login.
 * Admin accounts have higher privilege, so use a tighter window.
 * 10 attempts per IP per 15 minutes.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many login attempts from this IP. Please try again after 15 minutes.",
  },
  skip: () => process.env.NODE_ENV === "test",
});

module.exports = { authLimiter };
