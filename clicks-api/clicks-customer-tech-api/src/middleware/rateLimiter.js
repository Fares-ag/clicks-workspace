const rateLimit = require("express-rate-limit");
const { withRedisStore } = require("../../../clicks-shared/utils/redisRateLimitStore");

const WINDOW_MS = 15 * 60 * 1000;

/**
 * Strict limiter for unauthenticated auth endpoints (login, forgot-password, OTP).
 * 10 attempts per IP per 15 minutes prevents credential stuffing and brute-force
 * without impacting legitimate users (typical login: 1–2 attempts per session).
 */
const authLimiter = rateLimit(
  withRedisStore("auth", {
    windowMs: WINDOW_MS,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: "Too many attempts from this IP. Please try again after 15 minutes.",
      code: "RATE_LIMITED",
    },
    skip: () => process.env.NODE_ENV === "test",
  })
);

/**
 * Slightly more relaxed limiter for OTP verification — a user legitimately
 * retries after typos, so allow a few more per window.
 */
const otpLimiter = rateLimit(
  withRedisStore("otp", {
    windowMs: WINDOW_MS,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: "Too many OTP attempts from this IP. Please try again after 15 minutes.",
      code: "RATE_LIMITED",
    },
    skip: () => process.env.NODE_ENV === "test",
  })
);

/**
 * The pending-application screen polls /application-status every 15s with no
 * token (4 req/min per device, and Qatari mobile IPs are heavily NATed), so
 * authLimiter's 10-per-15-minutes would 429 legitimate applicants. This is
 * still low enough that walking the 8-digit Qatari number space from an IP
 * would take years — and the handler now answers with the status alone.
 */
const applicationStatusLimiter = rateLimit(
  withRedisStore("application-status", {
    windowMs: WINDOW_MS,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: "Too many requests from this IP. Please try again later.",
    },
    skip: () => process.env.NODE_ENV === "test",
  })
);

/**
 * Session refresh: the app calls it on launch/resume only when its token is
 * close to expiry, so this is generous — it must never 429 a customer who
 * is mid-job behind carrier NAT.
 */
const refreshLimiter = rateLimit(
  withRedisStore("token-refresh", {
    windowMs: WINDOW_MS,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: "Too many requests from this IP. Please try again later.",
      code: "RATE_LIMITED",
    },
    skip: () => process.env.NODE_ENV === "test",
  })
);

module.exports = { authLimiter, otpLimiter, applicationStatusLimiter, refreshLimiter };
