const rateLimit = require("express-rate-limit");

/**
 * Strict limiter for unauthenticated auth endpoints (login, forgot-password, OTP).
 * 10 attempts per IP per 15 minutes prevents credential stuffing and brute-force
 * without impacting legitimate users (typical login: 1–2 attempts per session).
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,  // Return rate limit info in RateLimit-* headers
  legacyHeaders: false,
  message: {
    error: "Too many attempts from this IP. Please try again after 15 minutes.",
  },
  // Skip rate limiting in test environments
  skip: () => process.env.NODE_ENV === "test",
});

/**
 * Slightly more relaxed limiter for OTP verification — a user legitimately
 * retries after typos, so allow a few more per window.
 */
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many OTP attempts from this IP. Please try again after 15 minutes.",
  },
  skip: () => process.env.NODE_ENV === "test",
});

module.exports = { authLimiter, otpLimiter };
