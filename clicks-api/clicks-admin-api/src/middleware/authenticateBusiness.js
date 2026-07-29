const jwt = require("jsonwebtoken");
const BusinessUser = require("../models/BusinessUser");
const Business = require("../models/Business");

/**
 * Verify JWT for business portal users (role: "business").
 * Attaches req.user, req.businessUser, req.business.
 */
async function authenticateBusiness(req, res, next) {
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

    if (payload.role !== "business" || !payload.id || !payload.business_id) {
      return res.status(403).json({ message: "Business access required" });
    }

    const businessUser = await BusinessUser.findById(payload.id);
    if (!businessUser || !businessUser.isActive) {
      return res.status(403).json({ message: "Business user inactive or not found" });
    }

    const business = await Business.findById(payload.business_id);
    if (!business || !business.isActive) {
      return res.status(403).json({ message: "Business inactive or not found" });
    }

    if (String(businessUser.business_id) !== String(business._id)) {
      return res.status(403).json({ message: "Business mismatch" });
    }

    req.user = payload;
    req.businessUser = businessUser;
    req.business = business;
    next();
  } catch (err) {
    console.error("authenticateBusiness error:", err);
    return res.status(500).json({ message: "Auth failed" });
  }
}

module.exports = authenticateBusiness;
