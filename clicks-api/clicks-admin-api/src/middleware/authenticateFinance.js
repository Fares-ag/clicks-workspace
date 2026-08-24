const jwt = require("jsonwebtoken");
const FinanceUser = require("../models/FinanceUser");

/**
 * Verify JWT for finance portal users (role: "finance").
 * Attaches req.user, req.financeUser.
 */
async function authenticateFinance(req, res, next) {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(503).json({ message: "Auth is not configured" });
    }

    let payload;
    try {
      payload = jwt.verify(token, secret);
    } catch {
      return res.status(403).json({ message: "Invalid token" });
    }

    if (payload.role !== "finance" || !payload.id) {
      return res.status(403).json({ message: "Finance access required" });
    }

    const financeUser = await FinanceUser.findById(payload.id);
    if (!financeUser || !financeUser.isActive) {
      return res.status(403).json({ message: "Finance user inactive or not found" });
    }

    req.user = payload;
    req.financeUser = financeUser;
    next();
  } catch (err) {
    console.error("authenticateFinance error:", err);
    return res.status(500).json({ message: "Auth failed" });
  }
}

/**
 * Gate a finance route on the FinanceUser's stored role ("admin" | "operator").
 * The finance JWT always carries role "finance", so the token can never be used
 * for this decision — only the row loaded by authenticateFinance can.
 * Must be mounted after authenticateFinance.
 */
function requireFinanceRole(...roles) {
  const allowed = roles.flat().filter(Boolean);
  return (req, res, next) => {
    const role = req.financeUser && req.financeUser.role;
    if (!role || !allowed.includes(role)) {
      return res.status(403).json({ message: "Insufficient finance role" });
    }
    next();
  };
}

module.exports = authenticateFinance;
module.exports.requireFinanceRole = requireFinanceRole;
