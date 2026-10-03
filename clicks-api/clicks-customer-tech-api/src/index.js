const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("../../clicks-shared/mongoose");
const { getCorsOrigins } = require("./utils/requireEnv");
const { createTechApp } = require("./createApp");

const { app } = createTechApp({ stubNotify: false, checkRedis: true });
const server = http.createServer(app);

const corsOrigins = getCorsOrigins();
const io = new Server(server, {
  cors: {
    origin: corsOrigins.length ? corsOrigins : "*",
  },
});

const { initializeSOSSocket } = require("./services/sosSocketService");
const { attachSocketAdapter } = require("./utils/socketAdapter");

let outboxWorkerHandle;

// Matches the admin API: without this a stray rejection (a Redis blip inside
// the adapter's publish, say) hits Node's default throw mode and takes the
// whole realtime layer down — every technician's location feed with it.
process.on("unhandledRejection", (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  console.error("Unhandled promise rejection:", err.stack || err.message);
  try {
    const { captureException } = require("../../clicks-shared/middleware/sentry");
    captureException(err, { source: "unhandledRejection" });
  } catch (reportErr) {
    console.error("Failed to report unhandled rejection:", reportErr.message);
  }
});

async function shutdown(signal) {
  console.log(`Received ${signal}, shutting down gracefully...`);
  const hardExit = setTimeout(() => {
    console.error("Graceful shutdown timed out after 10s");
    process.exit(1);
  }, 10000);
  hardExit.unref?.();

  try {
    const { stopOutboxWorker } = require("../../clicks-shared/services/outboxWorker");
    await stopOutboxWorker(outboxWorkerHandle);

    // Socket.IO first. server.close() waits for open connections to drain and
    // a WebSocket never drains on its own, so awaiting it first meant every
    // restart sat until the 10s hard-exit and killed clients mid-flight
    // instead of disconnecting them cleanly.
    io.disconnectSockets(true);
    await new Promise((resolve) => io.close(() => resolve()));

    await new Promise((resolve) => {
      // io.close() already closes the http server it was attached to; this is
      // just a belt-and-braces call, so an "already closed" error is expected.
      server.close(() => resolve());
    });

    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }

    const { closeRedis } = require("../../clicks-shared/utils/redisClient");
    await closeRedis();

    clearTimeout(hardExit);
    process.exit(0);
  } catch (err) {
    console.error("Shutdown error:", err);
    process.exit(1);
  }
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));

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
  app.set("notifyAdminBusinessLead", sosHandlers.notifyAdminBusinessLead);
  app.set("notifyAdminTechnicianJob", sosHandlers.notifyAdminTechnicianJob);
  app.set("notifyAdminHoldRequest", sosHandlers.notifyAdminHoldRequest);
  app.set("notifyAdminServiceRequest", sosHandlers.notifyAdminServiceRequest);
  app.set(
    "notifyAdminServiceRequestCancelled",
    sosHandlers.notifyAdminServiceRequestCancelled
  );

  io.on("connection", (socket) => {
    console.warn(
      `Deprecated root socket connected (${socket.id}) — use /technician, /customer, or /admin`
    );
  });

  const PORT = process.env.PORT || 5001;
  const MONGO_URI = process.env.MONGODB_URI;

  await mongoose.connect(MONGO_URI);

  const { shrinkTechnicianDocuments } = require("../../clicks-shared/utils/adminLookups");
  shrinkTechnicianDocuments().catch((err) => {
    console.error("tech shrink failed:", err.message);
  });

  const {
    startOutboxWorker,
    OUTBOX_TYPES,
  } = require("../../clicks-shared/services/outboxWorker");
  outboxWorkerHandle = startOutboxWorker(30000, {
    types: [OUTBOX_TYPES.PARTNER_ACCRUAL, OUTBOX_TYPES.TECHNICIAN_CREDIT],
  });

  server.listen(PORT, () => {
    console.log(`Clicks Customer/Technician API running on port ${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error("Bootstrap failed:", err);
  process.exit(1);
});
