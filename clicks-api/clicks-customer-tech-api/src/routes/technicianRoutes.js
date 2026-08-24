const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();
const technicianController = require("../controllers/technicianController");
const { authenticate } = require("../middleware/auth");
const { requireApprovedTechnician } = require("../middleware/requireApprovedTechnician");
const { authLimiter, otpLimiter } = require("../middleware/rateLimiter");
const upload = require("../middleware/upload");

// Operational endpoints additionally require a still-approved, still-active
// account, so a rejected or deactivated technician cannot keep working off a
// token that was issued before the change.
const approvedTechnician = [authenticate(["technician"]), requireApprovedTechnician];

/**
 * The pending-application screen polls /application-status every 15s with no
 * token (4 req/min per device, and Qatari mobile IPs are heavily NATed), so
 * authLimiter's 10-per-15-minutes would 429 legitimate applicants. This is
 * still low enough that walking the 8-digit Qatari number space from an IP
 * would take years — and the handler now answers with the status alone.
 */
const applicationStatusLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many requests from this IP. Please try again later.",
  },
  skip: () => process.env.NODE_ENV === "test",
});

router.post("/login", authLimiter, technicianController.login);
router.post("/forgot-password", authLimiter, technicianController.forgotPassword);
router.post("/verify-reset-otp", otpLimiter, technicianController.verifyResetOTP);
router.post("/reset-password", otpLimiter, technicianController.resetPassword);
router.get("/dashboard", approvedTechnician, technicianController.getDashboard);
router.patch("/status", approvedTechnician, technicianController.toggleStatus);
router.patch("/location", approvedTechnician, technicianController.updateLocation);
router.get("/jobs", approvedTechnician, technicianController.getJobs);
router.post("/jobs", approvedTechnician, technicianController.createTechnicianJob);
router.post("/jobs/:id/accept", approvedTechnician, technicianController.acceptJob);
router.post("/jobs/:id/reject", approvedTechnician, technicianController.rejectJob);
router.post("/fcm-token", approvedTechnician, technicianController.saveFcmToken);
router.delete("/fcm-token", authenticate(["technician"]), technicianController.clearFcmToken);

// Profile routes
router.get("/profile", authenticate(["technician"]), technicianController.getProfile);
router.put("/profile", authenticate(["technician"]), technicianController.updateProfile);
router.post("/delete", authenticate(["technician"]), technicianController.deleteAccount);
router.get("/vehicle", approvedTechnician, technicianController.getVehicle);
router.post(
  "/home-hero",
  approvedTechnician,
  upload.single("homeHero"),
  technicianController.uploadHomeHero
);
router.post(
  "/subscriptions",
  approvedTechnician,
  technicianController.createTechnicianSubscription
);

router.post(
  "/register",
  authLimiter,
  upload.fields([
    { name: "profilePicture" },
    { name: "licenseFront" },
    { name: "licenseBack" },
    { name: "permitFront" },
    { name: "permitBack" }
  ]),
  technicianController.registerTechnician
);
router.post("/otp/send", otpLimiter, technicianController.sendOTP);
router.post("/otp/verify", otpLimiter, technicianController.verifyOTP);
router.get(
  "/application-status",
  applicationStatusLimiter,
  technicianController.getApplicationStatus
);

module.exports = router;
