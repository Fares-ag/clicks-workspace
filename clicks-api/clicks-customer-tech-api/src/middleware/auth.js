const jwt = require("jsonwebtoken");
const { Customer } = require("../../../clicks-shared/models");
const { claimVersion, tokenVersionOf } = require("../utils/customerToken");

const authenticate = (roles = []) => {
  return async (req, res, next) => {
    if (!process.env.JWT_SECRET) {
      return res.status(503).json({ error: "Auth not configured", code: "AUTH_NOT_CONFIGURED" });
    }
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided", code: "TOKEN_MISSING" });
    }
    const token = authHeader.split(" ")[1];
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      const expired = err?.name === "TokenExpiredError";
      return res.status(401).json({
        error: expired ? "Session expired" : "Invalid token",
        code: expired ? "TOKEN_EXPIRED" : "TOKEN_INVALID",
      });
    }
    try {
      if (roles.length && !roles.includes(decoded.role)) {
        return res.status(403).json({ error: "Forbidden", code: "FORBIDDEN" });
      }
      if (decoded.role === "customer") {
        const customer = await Customer.findById(decoded.id).select(
          "status deleted_at token_version"
        );
        if (!customer || customer.deleted_at || customer.status !== "Active") {
          return res.status(403).json({
            error: "Account is not active",
            code: "ACCOUNT_INACTIVE",
          });
        }
        // Password reset / change / logout-everywhere bumped the version:
        // a token stolen with the phone stops working immediately (S13).
        if (claimVersion(decoded) !== tokenVersionOf(customer)) {
          return res.status(401).json({
            error: "Session revoked. Please sign in again.",
            code: "TOKEN_REVOKED",
          });
        }
      }
      req.user = decoded;
      next();
    } catch (err) {
      if (err?.name === "CastError") {
        return res.status(401).json({ error: "Invalid token", code: "TOKEN_INVALID" });
      }
      // A database blip is not a bad token: a 401 here made the app wipe the
      // session and drop a customer mid-job to Login.
      return res.status(503).json({ error: "Auth check failed", code: "AUTH_CHECK_FAILED" });
    }
  };
};

module.exports = { authenticate };
