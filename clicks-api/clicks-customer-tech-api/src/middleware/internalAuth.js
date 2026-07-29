/**
 * Shared-secret auth for internal admin-api → customer-tech-api calls.
 */
function authenticateInternal(req, res, next) {
  const expected = process.env.INTERNAL_API_SECRET;
  if (!expected) {
    console.error("INTERNAL_API_SECRET is not configured");
    return res.status(503).json({ message: "Internal API not configured" });
  }

  const provided =
    req.headers["x-internal-secret"] ||
    (req.headers.authorization || "").replace(/^Bearer\s+/i, "");

  if (!provided || provided !== expected) {
    return res.status(401).json({ message: "Unauthorized internal call" });
  }

  next();
}

module.exports = { authenticateInternal };
