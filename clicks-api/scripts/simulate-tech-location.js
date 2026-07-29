/**
 * Simulate technician GPS updates for Live Map verification.
 *
 * Usage:
 *   node scripts/simulate-tech-location.js [email] [lat] [lng]
 *
 * Defaults to omar.tech@clicks.local and a nearby Qatar coordinate.
 */
const path = require("path");
require("../clicks-admin-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-admin-api/.env"),
});
const mongoose = require("../clicks-shared/node_modules/mongoose");
const { io } = require("./node_modules/socket.io-client");
const Technician = require("../clicks-shared/models/Technician");

const SOCKET_URL = process.env.SOCKET_URL || "http://localhost:5001";
const email = process.argv[2] || "omar.tech@clicks.local";
const latitude = Number(process.argv[3] || 25.29);
const longitude = Number(process.argv[4] || 51.54);

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const tech = await Technician.findOne({ email }).lean();
  if (!tech) {
    console.error("Technician not found:", email);
    process.exit(1);
  }

  const technician_id = tech._id.toString();
  console.log("Connecting as technician", technician_id, email);

  const socket = io(`${SOCKET_URL}/technician`, {
    transports: ["websocket", "polling"],
  });

  await new Promise((resolve, reject) => {
    socket.on("connect", resolve);
    socket.on("connect_error", reject);
    setTimeout(() => reject(new Error("socket connect timeout")), 10000);
  });

  socket.emit("register", technician_id);
  socket.emit("updateLocation", {
    technician_id,
    latitude,
    longitude,
  });

  console.log("Emitted updateLocation", { technician_id, latitude, longitude });
  console.log("Watch Live Map — marker should move within ~2s");

  setTimeout(() => {
    socket.disconnect();
    mongoose.disconnect().finally(() => process.exit(0));
  }, 1500);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
