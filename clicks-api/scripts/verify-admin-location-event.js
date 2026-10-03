/**
 * Listen on /admin for the technician location feed, then trigger a simulated move.
 *
 * Both socket namespaces require a JWT (handshake auth.token) and the admin map
 * feed is room-scoped (emit "joinLiveMap"). The Live Map consumes
 * "technicianLocationBatch" (flushed every ADMIN_MAP_BATCH_MS, default 2s);
 * "technicianLocationUpdate" only fires with ADMIN_MAP_LEGACY_EVENTS=true, so
 * listen for both. Offline technicians are suppressed from the feed, so the
 * technician is set Online first (and restored afterwards).
 *
 * Env: SOCKET_URL (tech API, default http://localhost:5001), ADMIN_URL
 *      (default http://localhost:5000), ADMIN_EMAIL/ADMIN_PASSWORD,
 *      TECH_PHONE/TECH_PASSWORD, MONGODB_URI (from clicks-admin-api/.env)
 */
const path = require("path");
require("../clicks-admin-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-admin-api/.env"),
});
const mongoose = require("mongoose");
const { io } = require("./node_modules/socket.io-client");
const Technician = require("../clicks-shared/models/Technician");

const SOCKET_URL = (process.env.SOCKET_URL || "http://localhost:5001").replace(/\/$/, "");
const ADMIN_URL = (process.env.ADMIN_URL || "http://localhost:5000").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@clicks.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin123!";
const TECH_PHONE = process.env.TECH_PHONE || "+97411111111";
const TECH_PASSWORD = process.env.TECH_PASSWORD || "Tech123!";

async function request(method, url, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function connect(namespace, token) {
  const sock = io(`${SOCKET_URL}${namespace}`, {
    transports: ["websocket", "polling"],
    auth: { token },
  });
  return new Promise((resolve, reject) => {
    sock.on("connect", () => resolve(sock));
    sock.on("connect_error", (e) => reject(new Error(`${namespace} connect_error: ${e.message}`)));
    setTimeout(() => reject(new Error(`${namespace} connect timeout`)), 10000);
  });
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const tech = await Technician.findOne({ email: "omar.tech@clicks.local" }).lean();
  if (!tech) throw new Error("Omar not found");
  const omarId = tech._id.toString();

  const adminLogin = await request("POST", `${ADMIN_URL}/api/auth/login`, {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });
  const adminToken = adminLogin.data?.accessToken || adminLogin.data?.token;
  if (!adminToken) throw new Error(`admin login failed (${adminLogin.status})`);

  const techLogin = await request("POST", `${SOCKET_URL}/api/technicians/login`, {
    phone: TECH_PHONE,
    password: TECH_PASSWORD,
  });
  const techToken = techLogin.data?.token;
  if (!techToken) throw new Error(`technician login failed (${techLogin.status})`);
  // updateLocation uses the JWT subject, so match on the logged-in technician.
  const technician_id = String(techLogin.data?.technician?._id || techLogin.data?.id || omarId);
  if (technician_id !== omarId) {
    console.log(`note: TECH_PHONE resolves to ${technician_id}; Omar (by email) is ${omarId}`);
  }

  const prevStatus = tech.status;
  const online = await request("PATCH", `${SOCKET_URL}/api/technicians/status`, { status: "Online" }, techToken);
  console.log(`technician status -> Online (${online.status})`);

  const admin = await connect("/admin", adminToken);
  admin.emit("register");
  admin.emit("joinLiveMap");

  const got = new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error("no technicianLocationBatch / technicianLocationUpdate within 15s")),
      15000
    );
    const onHit = (event) => (data) => {
      const updates = Array.isArray(data?.updates) ? data.updates : [data];
      const mine = updates.find((u) => String(u?.technician_id) === technician_id);
      if (mine) {
        clearTimeout(t);
        resolve({ event, update: mine });
      }
    };
    admin.on("technicianLocationBatch", onHit("technicianLocationBatch"));
    admin.on("technicianLocationUpdate", onHit("technicianLocationUpdate"));
  });

  const techSock = await connect("/technician", techToken);
  techSock.emit("register");
  // Jitter so the write is not skipped as min_move / throttle.
  const latitude = 25.301 + Math.random() * 0.002;
  const longitude = 51.551 + Math.random() * 0.002;
  techSock.emit("updateLocation", { technician_id, latitude, longitude, accuracy: 5 });

  const data = await got;
  console.log("PASS admin received", data.event, JSON.stringify(data.update));

  if (prevStatus === "Offline") {
    const back = await request("PATCH", `${SOCKET_URL}/api/technicians/status`, { status: "Offline" }, techToken);
    console.log(`technician status restored -> Offline (${back.status})`);
  }

  techSock.disconnect();
  admin.disconnect();
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("FAIL", err.message);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
