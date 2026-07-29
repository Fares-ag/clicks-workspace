// Clicks API Entry Point

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const dotenv = require("dotenv");
const mongoose = require("clicks-shared/node_modules/mongoose");
const { requireEnv, getCorsOrigins } = require("./utils/requireEnv");

dotenv.config();
requireEnv();

const app = express();

const corsOrigins = getCorsOrigins();
const isLocalDevOrigin = (origin) =>
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(String(origin || ""));

app.use(
  cors({
    origin: corsOrigins.length
      ? (origin, cb) => {
          // Allow non-browser tools (no Origin), configured frontends, and local Flutter web
          if (!origin || corsOrigins.includes(origin) || isLocalDevOrigin(origin)) {
            return cb(null, true);
          }
          return cb(new Error(`CORS blocked for origin: ${origin}`));
        }
      : true, // dev fallback if CORS_ORIGINS unset — set it for production
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));
const { requestContext, errorHandler } = require("../../clicks-shared/middleware/observability");
process.env.SERVICE_NAME = process.env.SERVICE_NAME || "clicks-admin-api";
app.use(requestContext);
app.use(morgan("dev"));

// Health check route (public)
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Clicks API is running" });
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
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/faqs", faqRoutes);
app.use("/api/privacy-policy", privacyPolicyRoutes);
app.use("/api/terms-and-conditions", termsAndConditionsRoutes);
app.use("/api/receipts", require("./routes/receipts"));
app.use("/api/sos", require("./routes/sos"));
app.use("/api/business", require("./routes/businessPortal"));
app.use("/api/businesses", require("./routes/businesses"));
app.use("/api/subscriptions", require("./routes/subscriptions"));
app.use("/api/partners", require("./routes/partners"));
app.use("/api/partner", require("./routes/partnerPortal"));

app.use(errorHandler);

// MongoDB connection
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGODB_URI;

mongoose
  .connect(MONGO_URI)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Clicks API running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });
