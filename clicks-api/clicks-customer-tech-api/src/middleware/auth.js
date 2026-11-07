const jwt = require("jsonwebtoken");
const { Customer } = require("../../../clicks-shared/models");

const authenticate = (roles = []) => {
  return async (req, res, next) => {
    if (!process.env.JWT_SECRET) {
      return res.status(503).json({ error: "Auth not configured" });
    }
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }
    const token = authHeader.split(" ")[1];
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (roles.length && !roles.includes(decoded.role)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      if (decoded.role === "customer") {
        const customer = await Customer.findById(decoded.id).select(
          "status deleted_at"
        );
        if (!customer || customer.deleted_at || customer.status !== "Active") {
          return res.status(403).json({
            error: "Account is not active",
            code: "ACCOUNT_INACTIVE",
          });
        }
      }
      req.user = decoded;
      next();
    } catch (err) {
      return res.status(401).json({ error: "Invalid token" });
    }
  };
};

module.exports = { authenticate };
