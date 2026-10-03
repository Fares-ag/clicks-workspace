/**
 * Express app factory — importable by integration tests without Socket.IO or listen().
 * Runtime entry point remains src/index.js (Socket.IO bootstrap + Mongo + listen).
 */
const dotenv = require("dotenv");
dotenv.config();

const { initSentry, sentryRequestMiddleware, sentryErrorMiddleware } = require("../../clicks-shared/middleware/sentry");
initSentry();

const express = require("express");
const compression = require("compression");
const cors = require("cors");
const morgan = require("morgan");
const mongoose = require("../../clicks-shared/mongoose");
const { requireEnv, getCorsOrigins } = require("./utils/requireEnv");

requireEnv();

const noopAsync = async () => {};

async function registerTechHealthRoutes(app, { checkRedis = false } = {}) {
  app.get("/api/health/live", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/health", async (_req, res) => {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ status: "degraded", db: "down" });
    }

    if (checkRedis && process.env.REDIS_URL && String(process.env.REDIS_URL).trim()) {
      try {
        const { getSocketAdapterType, pingRedis } = require("./utils/socketAdapter");
        await pingRedis(1000);
        return res.json({ status: "ok", db: "up", socketAdapter: getSocketAdapterType() });
      } catch {
        return res.status(503).json({ status: "degraded", redis: "down" });
      }
    }

    res.json({ status: "ok", db: "up" });
  });
}

function attachStubNotifyHandlers(app) {
  app.set("notifyAssignedTechnician", noopAsync);
  app.set("notifyCustomerTechnicianAssigned", noopAsync);
  app.set("notifyCustomerTechnicianAccepted", noopAsync);
  app.set("notifyCustomerJobEvent", noopAsync);
  app.set("notifyAdminTechnicianPresence", noopAsync);
  app.set("notifyAdminTechnicianLocation", noopAsync);
  app.set("notifySosClaimed", noopAsync);
  app.set("notifyAdminBusinessJob", noopAsync);
  app.set("notifyAdminBusinessLead", noopAsync);
  app.set("notifyAdminTechnicianJob", noopAsync);
  app.set("notifyAdminHoldRequest", noopAsync);
  app.set("notifyAdminServiceRequest", noopAsync);
  app.set("notifyAdminServiceRequestCancelled", noopAsync);
}

/**
 * @param {{ stubNotify?: boolean }} [opts]
 *   stubNotify defaults true — tests never need live Socket.IO handlers.
 */
function createTechApp(opts = {}) {
  const stubNotify = opts.stubNotify !== false;

  const corsOrigins = getCorsOrigins();
  if (!corsOrigins.length) {
    console.warn(
      "CORS_ORIGINS is empty — allowing all origins (local/dev only). Set CORS_ORIGINS in production."
    );
  }

  const app = express();

  app.use(
    cors({
      origin: corsOrigins.length ? corsOrigins : true,
    })
  );
  app.use(compression());
  app.use(express.json());

  const { sanitizeRequest } = require("../../clicks-shared/middleware/sanitize");
  app.use(sanitizeRequest({ reject: String(process.env.SANITIZE_REJECT || "") === "true" }));

  app.set("trust proxy", 1);
  const { requestContext, errorHandler } = require("../../clicks-shared/middleware/observability");
  process.env.SERVICE_NAME = process.env.SERVICE_NAME || "clicks-customer-tech-api";
  app.use(requestContext);
  app.use(sentryRequestMiddleware());
  if (process.env.NODE_ENV === "development") {
    app.use(morgan("dev"));
  }

  const customerRoutes = require("./routes/customerRoutes");
  const technicianRoutes = require("./routes/technicianRoutes");
  const vehicleRoutes = require("./routes/vehicleRoutes");
  const sosRoutes = require("./routes/sosRoutes");
  const jobRoutes = require("./routes/jobRoutes");
  const supportRoutes = require("./routes/supportRoutes");
  const contactUsRoutes = require("./routes/contactUsRoutes");
  const contentRoutes = require("./routes/contentRoutes");

  registerTechHealthRoutes(app, { checkRedis: opts.checkRedis === true });

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
  // /api/repairs removed: unauthenticated-by-job CRUD on billable line items.
  // Repairs are managed through POST /api/jobs/:id/repairs, which enforces assertJobAccess.
  app.use("/api/notifications", require("./routes/notificationRoutes"));
  app.use("/api/maps", require("./routes/mapsRoutes"));

  app.get("/api/launch-flags", (_req, res) => {
    const { getLaunchFlags } = require("./utils/featureFlags");
    res.json(getLaunchFlags());
  });

  app.use(sentryErrorMiddleware());
  app.use(errorHandler);

  if (stubNotify) {
    attachStubNotifyHandlers(app);
  }

  return { app };
}

function wireSosNotifyHandlers(app, sosHandlers) {
  app.set("notifyAssignedTechnician", sosHandlers.notifyAssignedTechnician);
  app.set("notifyCustomerTechnicianAssigned", sosHandlers.notifyCustomerTechnicianAssigned);
  app.set("notifyCustomerTechnicianAccepted", sosHandlers.notifyCustomerTechnicianAccepted);
  app.set("notifyCustomerJobEvent", sosHandlers.notifyCustomerJobEvent);
  app.set("notifyAdminTechnicianPresence", sosHandlers.notifyAdminTechnicianPresence);
  app.set("notifyAdminTechnicianLocation", sosHandlers.notifyAdminTechnicianLocation);
  app.set("notifySosClaimed", sosHandlers.notifySosClaimed);
  app.set("notifyAdminBusinessJob", sosHandlers.notifyAdminBusinessJob);
  app.set("notifyAdminBusinessLead", sosHandlers.notifyAdminBusinessLead);
  app.set("notifyAdminTechnicianJob", sosHandlers.notifyAdminTechnicianJob);
  app.set("notifyAdminHoldRequest", sosHandlers.notifyAdminHoldRequest);
  app.set("notifyAdminServiceRequest", sosHandlers.notifyAdminServiceRequest);
  app.set(
    "notifyAdminServiceRequestCancelled",
    sosHandlers.notifyAdminServiceRequestCancelled
  );
}

/**
 * Full HTTP + Socket.IO stack for integration tests (mirrors src/index.js wiring).
 * @returns {Promise<{ app, server, io }>}
 */
async function createTechAppWithSocket(opts = {}) {
  const { app } = createTechApp({ stubNotify: false, checkRedis: false, ...opts });
  const http = require("http");
  const { Server } = require("socket.io");
  const { getCorsOrigins } = require("./utils/requireEnv");
  const server = http.createServer(app);
  const corsOrigins = getCorsOrigins();
  const io = new Server(server, {
    cors: {
      origin: corsOrigins.length ? corsOrigins : "*",
    },
  });

  const { attachSocketAdapter } = require("./utils/socketAdapter");
  await attachSocketAdapter(io);

  const { initializeSOSSocket } = require("./services/sosSocketService");
  const sosHandlers = initializeSOSSocket(io);
  wireSosNotifyHandlers(app, sosHandlers);

  return { app, server, io };
}

module.exports = {
  createTechApp,
  createTechAppWithSocket,
  attachStubNotifyHandlers,
  registerTechHealthRoutes,
  wireSosNotifyHandlers,
};
