const jwt = require("../../clicks-admin-api/node_modules/jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

function adminToken(role, id = "507f1f77bcf86cd799439011") {
  return jwt.sign({ id, role }, JWT_SECRET, { expiresIn: "1h" });
}

function technicianToken(technicianId) {
  return jwt.sign(
    { id: technicianId.toString(), role: "technician" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

function customerToken(customerId) {
  return jwt.sign(
    { id: customerId.toString(), role: "customer" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

module.exports = {
  adminToken,
  technicianToken,
  customerToken,
  bearer,
};
