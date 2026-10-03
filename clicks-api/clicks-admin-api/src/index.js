// Clicks API Entry Point

const mongoose = require("../../clicks-shared/mongoose");
const { createAdminApp } = require("./createApp");

const app = createAdminApp();

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGODB_URI;

let outboxWorkerHandle;
let statsRefresherHandle;
let server;

// Express 4 does not forward async handler rejections to the error middleware,
// so a stray unhandled rejection would otherwise hit Node's default `throw`
// mode and kill the container. Report it instead of taking the API down.
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
    const { stopStatsRefresher } = require("./services/statsRefresher");
    stopStatsRefresher(statsRefresherHandle);

    if (server) {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }

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

mongoose
  .connect(MONGO_URI)
  .then(() => {
    const {
      startOutboxWorker,
      OUTBOX_TYPES,
    } = require("../../clicks-shared/services/outboxWorker");
    outboxWorkerHandle = startOutboxWorker(30000, {
      types: [OUTBOX_TYPES.ADMIN_BUSINESS_JOB_NOTIFY],
    });
    const { startStatsRefresher } = require("./services/statsRefresher");
    statsRefresherHandle = startStatsRefresher();
    const { warmAdminLookups } = require("../../clicks-shared/utils/adminLookups");
    warmAdminLookups().catch((err) => {
      console.error("admin lookup warm failed:", err.message);
    });
    server = app.listen(PORT, () => {
      console.log(`Clicks API running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });
