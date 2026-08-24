/**
 * Express app factory — importable by integration tests without listening.
 * Runtime entry point remains src/index.js (connects Mongo + listens).
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

function createAdminApp() {
  const app = express();

  const corsOrigins = getCorsOrigins();
  const isProduction = process.env.NODE_ENV === "production";
  // Local listeners are only trusted outside production. In production this was
  // a permanent allow-list entry for any http://localhost:PORT page.
  const allowLocalDevOrigins = !isProduction;
  const isLocalDevOrigin = (origin) =>
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(String(origin || ""));

  if (!corsOrigins.length) {
    // Never fall through to `origin: true`: with credentials: true that reflects
    // any caller's Origin and hands every site a readable authenticated response.
    if (isProduction) {
      console.error(
        "Missing required environment variables: CORS_ORIGINS (or FRONTEND_URL)"
      );
      process.exit(1);
    }
    console.warn(
      "CORS_ORIGINS/FRONTEND_URL not set — only localhost origins will be allowed."
    );
  }

  app.use(
    cors({
      origin: (origin, cb) => {
        // No Origin header: same-origin, curl, health checks, native apps.
        if (!origin) return cb(null, true);
        if (corsOrigins.includes(origin)) return cb(null, true);
        if (allowLocalDevOrigins && isLocalDevOrigin(origin)) return cb(null, true);
        // `false`, not an Error — an Error reaches errorHandler and surfaces to a
        // misconfigured front end as HTTP 500 instead of a plain CORS denial.
        return cb(null, false);
      },
      credentials: true,
      // The finance portal runs on a different origin and reads the CSV export's
      // filename from Content-Disposition; without this the header is invisible
      // to fetch() and the server can never rename the download.
      exposedHeaders: ["Content-Disposition"],
    })
  );
  app.use(compression());
  app.use(express.json({ limit: "1mb" }));

  const { sanitizeRequest } = require("../../clicks-shared/middleware/sanitize");
  app.use(sanitizeRequest({ reject: String(process.env.SANITIZE_REJECT || "") === "true" }));

  app.set("trust proxy", 1);
  const { requestContext, errorHandler } = require("../../clicks-shared/middleware/observability");
  process.env.SERVICE_NAME = process.env.SERVICE_NAME || "clicks-admin-api";
  app.use(requestContext);
  app.use(sentryRequestMiddleware());
  if (process.env.NODE_ENV === "development") {
    app.use(morgan("dev"));
  }

  app.get("/api/health/live", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/health", (_req, res) => {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ status: "degraded", db: "down" });
    }
    res.json({ status: "ok", db: "up" });
  });

  const authRoutes = require("./routes/auth");
  const adminRoutes = require("./routes/admins");
  const vehicleMakeRoutes = require("./routes/vehicleMakes");
  const vehicleModelRoutes = require("./routes/vehicleModels");
  const vehicleTypeRoutes = require("./routes/vehicleType");
  const technicianRoutes = require("./routes/technicians");
  const vehicleRoutes = require("./routes/vehicles");
  const vehicleInsuranceRoutes = require("./routes/vehicleInsurance");
  const customerRoutes = require("./routes/customers");
  const performanceRoutes = require("./routes/performance");
  const sourceRoutes = require("./routes/sources");
  const jobRoutes = require("./routes/jobs");
  const dashboardRoutes = require("./routes/dashboard");
  const faqRoutes = require("./routes/faqs");
  const privacyPolicyRoutes = require("./routes/privacyPolicy");
  const termsAndConditionsRoutes = require("./routes/termsAndConditions");
  const accountDeletionRoutes = require("./routes/accountDeletion");
  app.use("/api/auth", authRoutes);
  app.use("/api/admins", adminRoutes);
  app.use("/api/vehicle-makes", vehicleMakeRoutes);
  app.use("/api/vehicle-models", vehicleModelRoutes);
  app.use("/api/vehicle-types", vehicleTypeRoutes);
  app.use("/api/technicians", technicianRoutes);
  app.use("/api/vehicles", vehicleRoutes);
  app.use("/api/vehicle-insurance", vehicleInsuranceRoutes);
  app.use("/api/customers", customerRoutes);
  app.use("/api/performance", performanceRoutes);
  app.use("/api/sources", sourceRoutes);
  app.use("/api/jobs", jobRoutes);
  app.use("/api/leads", require("./routes/leads"));
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/faqs", faqRoutes);
  app.use("/api/privacy-policy", privacyPolicyRoutes);
  app.use("/api/terms-and-conditions", termsAndConditionsRoutes);
  app.use("/api/account-deletion", accountDeletionRoutes);
  app.use("/api/receipts", require("./routes/receipts"));
  app.use("/api/sos", require("./routes/sos"));
  app.use("/api/service-requests", require("./routes/serviceRequests"));
  app.use("/api/business", require("./routes/businessPortal"));
  app.use("/api/businesses", require("./routes/businesses"));
  app.use("/api/finance", require("./routes/financePortal"));
  app.use("/api/finance-users", require("./routes/financeUsers"));
  app.use("/api/finance-overview", require("./routes/financeOverview"));
  app.use("/api/partners", require("./routes/partners"));
  app.use("/api/partner", require("./routes/partnerPortal"));

  app.use(sentryErrorMiddleware());
  app.use(errorHandler);

  return app;
}

module.exports = { createAdminApp };
