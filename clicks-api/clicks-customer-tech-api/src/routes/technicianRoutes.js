const express = require("express");
const router = express.Router();
const technicianController = require("../controllers/technicianController");
const { authenticate } = require("../middleware/auth");
const { authLimiter, otpLimiter } = require("../middleware/rateLimiter");
const upload = require("../middleware/upload");

router.post("/login", authLimiter, technicianController.login);
router.post("/forgot-password", authLimiter, technicianController.forgotPassword);
router.post("/verify-reset-otp", otpLimiter, technicianController.verifyResetOTP);
router.post("/reset-password", otpLimiter, technicianController.resetPassword);
router.get("/dashboard", authenticate(["technician"]), technicianController.getDashboard);
router.patch("/status", authenticate(["technician"]), technicianController.toggleStatus);
router.patch("/location", authenticate(["technician"]), technicianController.updateLocation);
router.get("/jobs", authenticate(["technician"]), technicianController.getJobs);
router.post("/jobs", authenticate(["technician"]), technicianController.createTechnicianJob);
router.post("/jobs/:id/accept", authenticate(["technician"]), technicianController.acceptJob);
router.post("/jobs/:id/reject", authenticate(["technician"]), technicianController.rejectJob);
router.post("/fcm-token", authenticate(["technician"]), technicianController.saveFcmToken);
router.delete("/fcm-token", authenticate(["technician"]), technicianController.clearFcmToken);

// Profile routes
router.get("/profile", authenticate(["technician"]), technicianController.getProfile);
router.put("/profile", authenticate(["technician"]), technicianController.updateProfile);
router.post("/delete", authenticate(["technician"]), technicianController.deleteAccount);
router.get("/vehicle", authenticate(["technician"]), technicianController.getVehicle);
router.post(
  "/home-hero",
  authenticate(["technician"]),
  upload.single("homeHero"),
  technicianController.uploadHomeHero
);
router.post(
  "/subscriptions",
  authenticate(["technician"]),
  technicianController.createTechnicianSubscription
);

router.post(
  "/register",
  upload.fields([
    { name: "profilePicture" },
    { name: "licenseFront" },
    { name: "licenseBack" },
    { name: "permitFront" },
    { name: "permitBack" }
  ]),
  technicianController.registerTechnician
);
router.post("/otp/send", technicianController.sendOTP);
router.post("/otp/verify", technicianController.verifyOTP);
router.get("/application-status", technicianController.getApplicationStatus);

module.exports = router;
