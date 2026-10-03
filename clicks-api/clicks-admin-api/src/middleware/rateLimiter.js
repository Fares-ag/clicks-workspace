const rateLimit = require("express-rate-limit");
const { withRedisStore } = require("../../../clicks-shared/utils/redisRateLimitStore");

const WINDOW_MS = 15 * 60 * 1000;

/**
 * Strict limiter for admin login.
 * Admin accounts have higher privilege, so use a tighter window.
 * 10 attempts per IP per 15 minutes.
 */
const authLimiter = rateLimit(
  withRedisStore("auth", {
    windowMs: WINDOW_MS,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      message: "Too many login attempts from this IP. Please try again after 15 minutes.",
    },
    skip: () => process.env.NODE_ENV === "test",
  })
);

module.exports = { authLimiter };
