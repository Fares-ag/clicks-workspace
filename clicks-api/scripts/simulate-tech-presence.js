/**
 * Simulate technician Online/Offline presence for Live Map.
 *
 * Usage:
 *   node scripts/simulate-tech-presence.js Online
 *   node scripts/simulate-tech-presence.js Offline
 *   node scripts/simulate-tech-presence.js Online omar.tech@clicks.local
 */
const path = require("path");
require("../clicks-admin-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-admin-api/.env"),
});
require("../clicks-admin-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-customer-tech-api/.env"),
  override: true,
});
const mongoose = require("../clicks-shared/node_modules/mongoose");
const Technician = require("../clicks-shared/models/Technician");

const API_URL = process.env.CUSTOMER_TECH_API_URL || "http://localhost:5001";
const status = process.argv[2] || "Online";
const email = process.argv[3] || "omar.tech@clicks.local";

if (!["Online", "Offline"].includes(status)) {
  console.error("Status must be Online or Offline");
  process.exit(1);
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const tech = await Technician.findOne({ email });
  if (!tech) {
    console.error("Technician not found:", email);
    process.exit(1);
  }

  const jwt = require("../clicks-customer-tech-api/node_modules/jsonwebtoken");
  const secret = process.env.JWT_SECRET || "secret";
  const token = jwt.sign(
    { id: tech._id.toString(), role: "technician" },
    secret,
    { expiresIn: "1h" }
  );

  const res = await fetch(`${API_URL}/api/technicians/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status }),
  });
  const body = await res.json();
  console.log("PATCH /api/technicians/status", res.status, body);

  await mongoose.disconnect();
  process.exit(res.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
