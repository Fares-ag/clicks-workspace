const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const dotenv = require("dotenv");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("clicks-shared/node_modules/mongoose");

dotenv.config();

const { requireEnv, getCorsOrigins } = require("./utils/requireEnv");
requireEnv();

const corsOrigins = getCorsOrigins();
if (!corsOrigins.length) {
  console.warn(
    "CORS_ORIGINS is empty — allowing all origins (local/dev only). Set CORS_ORIGINS in production."
  );
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: corsOrigins.length ? corsOrigins : "*",
  },
});

// Middleware
app.use(
  cors({
    origin: corsOrigins.length ? corsOrigins : true,
  })
);
app.use(express.json());
const { requestContext, errorHandler } = require("../../clicks-shared/middleware/observability");
process.env.SERVICE_NAME = process.env.SERVICE_NAME || "clicks-customer-tech-api";
app.use(requestContext);
app.use(morgan("dev"));

const customerRoutes = require("./routes/customerRoutes");
const technicianRoutes = require("./routes/technicianRoutes");
const vehicleRoutes = require("./routes/vehicleRoutes");
const sosRoutes = require("./routes/sosRoutes");
const jobRoutes = require("./routes/jobRoutes");
const supportRoutes = require("./routes/supportRoutes");
const contactUsRoutes = require("./routes/contactUsRoutes");
const contentRoutes = require("./routes/contentRoutes");

// Initialize SOS WebSocket service
const { initializeSOSSocket } = require("./services/sosSocketService");
const { attachSocketAdapter } = require("./utils/socketAdapter");

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Clicks Customer/Technician API is running",
    socketAdapter: process.env.REDIS_URL ? "redis" : "memory",
  });
});

// API routes
app.use("/api/customers", customerRoutes);
app.use("/api/technicians", technicianRoutes);
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/sos", sosRoutes);
app.use("/api/service-requests", require("./routes/serviceRequestRoutes"));
app.use("/api/jobs", jobRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/contact-us", contactUsRoutes);
app.use("/api/content", contentRoutes);
app.use("/api/analytics", require("./routes/analyticsRoutes"));
app.use("/api/receipts", require("./routes/receiptRoutes"));
app.use("/api/repairs", require("./routes/repairProcedureRoutes"));
app.use("/api/notifications", require("./routes/notificationRoutes"));
app.use("/api/maps", require("./routes/mapsRoutes"));

app.get("/api/launch-flags", (_req, res) => {
  const { getLaunchFlags } = require("./utils/featureFlags");
  res.json(getLaunchFlags());
});

app.use(errorHandler);

async function bootstrap() {
  await attachSocketAdapter(io);

  const sosHandlers = initializeSOSSocket(io);

  app.set("notifyAssignedTechnician", sosHandlers.notifyAssignedTechnician);
  app.set("notifyCustomerTechnicianAssigned", sosHandlers.notifyCustomerTechnicianAssigned);
  app.set("notifyCustomerTechnicianAccepted", sosHandlers.notifyCustomerTechnicianAccepted);
  app.set("notifyCustomerJobEvent", sosHandlers.notifyCustomerJobEvent);
  app.set("notifyAdminTechnicianPresence", sosHandlers.notifyAdminTechnicianPresence);
  app.set("notifyAdminTechnicianLocation", sosHandlers.notifyAdminTechnicianLocation);
  app.set("notifySosClaimed", sosHandlers.notifySosClaimed);
  app.set("notifyAdminBusinessJob", sosHandlers.notifyAdminBusinessJob);
  app.set("notifyAdminTechnicianJob", sosHandlers.notifyAdminTechnicianJob);
  app.set("notifyAdminServiceRequest", sosHandlers.notifyAdminServiceRequest);
  app.set(
    "notifyAdminServiceRequestCancelled",
    sosHandlers.notifyAdminServiceRequestCancelled
  );

  // Legacy default namespace — unauthenticated; not used by current clients.
  // Live Map / SOS use JWT namespaced paths: /technician, /customer, /admin.
  io.on("connection", (socket) => {
    console.warn(
      `Deprecated root socket connected (${socket.id}) — use /technician, /customer, or /admin`
    );
  });

  const PORT = process.env.PORT || 5001;
  const MONGO_URI = process.env.MONGODB_URI;

  await mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  server.listen(PORT, () => {
    console.log(`Clicks Customer/Technician API running on port ${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error("Bootstrap failed:", err);
  process.exit(1);
});
