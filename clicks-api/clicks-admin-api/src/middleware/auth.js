const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");

function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No token provided" });

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return res.status(503).json({ message: "Auth is not configured" });
  }

  jwt.verify(token, secret, { algorithms: ["HS256"] }, async (err, user) => {
    if (err) return res.status(403).json({ message: "Invalid token" });

    try {
      const admin = await Admin.findById(user.id)
        .select("isActive authTokenVersion")
        .lean();
      if (!admin) {
        return res.status(401).json({ message: "Session expired" });
      }
      if (admin.isActive === false) {
        return res.status(403).json({
          message:
            "Account is deactivated. Please contact an administrator.",
        });
      }
      const tokenVer = Number(user.authTokenVersion) || 0;
      const currentVer = Number(admin.authTokenVersion) || 0;
      if (tokenVer !== currentVer) {
        return res.status(401).json({ message: "Session expired" });
      }
      req.user = user;
      next();
    } catch (verifyErr) {
      console.error("authenticateToken admin check failed:", verifyErr.message);
      return res.status(503).json({ message: "Auth temporarily unavailable" });
    }
  });
}

module.exports = authenticateToken;
