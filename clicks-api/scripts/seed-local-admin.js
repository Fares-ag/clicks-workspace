/**
 * Seed a local Super Admin for development login.
 * Usage: node scripts/seed-local-admin.js
 */
const path = require("path");
require("../clicks-admin-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-admin-api/.env"),
});
const mongoose = require("../clicks-shared/node_modules/mongoose");
const bcrypt = require("../clicks-admin-api/node_modules/bcryptjs");
const Admin = require("../clicks-shared/models/Admin");

const MONGO_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/clicks";
const EMAIL = "admin@clicks.local";
const PASSWORD = "Admin123!";

async function main() {
  await mongoose.connect(MONGO_URI);
  const existing = await Admin.findOne({ email: EMAIL });
  if (existing) {
    console.log("Admin already exists:", EMAIL);
    console.log("Password:", PASSWORD);
    process.exit(0);
  }
  await Admin.create({
    firstName: "Local",
    lastName: "Admin",
    role: "Super Admin",
    email: EMAIL,
    phone: "+97400000000",
    password: bcrypt.hashSync(PASSWORD, 10),
    isActive: true,
  });
  console.log("Created Super Admin");
  console.log("Email:", EMAIL);
  console.log("Password:", PASSWORD);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
