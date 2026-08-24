/**
 * Listen on /admin for technicianLocationUpdate, then trigger a simulated move.
 */
const path = require("path");
require("../clicks-admin-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-admin-api/.env"),
});
const mongoose = require("mongoose");
const { io } = require("./node_modules/socket.io-client");
const Technician = require("../clicks-shared/models/Technician");

const SOCKET_URL = process.env.SOCKET_URL || "http://localhost:5001";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const tech = await Technician.findOne({ email: "omar.tech@clicks.local" }).lean();
  if (!tech) throw new Error("Omar not found");
  const technician_id = tech._id.toString();

  const admin = io(`${SOCKET_URL}/admin`, { transports: ["websocket", "polling"] });
  await new Promise((resolve, reject) => {
    admin.on("connect", resolve);
    admin.on("connect_error", reject);
    setTimeout(() => reject(new Error("admin connect timeout")), 10000);
  });
  admin.emit("register", "verify-script");

  const got = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("no technicianLocationUpdate within 5s")), 5000);
    admin.on("technicianLocationUpdate", (data) => {
      clearTimeout(t);
      resolve(data);
    });
  });

  const techSock = io(`${SOCKET_URL}/technician`, {
    transports: ["websocket", "polling"],
  });
  await new Promise((resolve, reject) => {
    techSock.on("connect", resolve);
    techSock.on("connect_error", reject);
    setTimeout(() => reject(new Error("tech connect timeout")), 10000);
  });
  techSock.emit("register", technician_id);
  techSock.emit("updateLocation", {
    technician_id,
    latitude: 25.301,
    longitude: 51.551,
  });

  const data = await got;
  console.log("PASS admin received", data);

  techSock.disconnect();
  admin.disconnect();
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("FAIL", err.message);
  process.exit(1);
});
