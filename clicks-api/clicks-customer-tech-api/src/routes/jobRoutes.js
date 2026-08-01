const express = require("express");
const router = express.Router();
const jobController = require("../controllers/jobController");
const { authenticate } = require("../middleware/auth");

// Session resume endpoints (must be before /:id routes)
router.get("/customer/session", authenticate(["customer"]), jobController.getCustomerSession);
router.get("/customer/active", authenticate(["customer"]), jobController.getCustomerActiveJob);
router.get("/customer/active-sos", authenticate(["customer"]), jobController.getCustomerActiveSOS);
router.get("/technician/session", authenticate(["technician"]), jobController.getTechnicianSession);
router.get("/technician/active", authenticate(["technician"]), jobController.getTechnicianActiveJob);

router.post("/", authenticate(["customer"]), jobController.createJob);
router.get("/", authenticate(["customer", "technician"]), jobController.getJobs);
router.get("/customer/history", authenticate(["customer"]), jobController.getCustomerJobs);
router.patch("/:id/status", authenticate(["technician"]), jobController.updateJobStatus);
router.patch("/:id/details", authenticate(["technician"]), jobController.updateJobDetails);
router.post(
  "/:id/signature",
  authenticate(["technician"]),
  (req, res, next) => {
    require("../middleware/upload").single("signature")(req, res, (err) => {
      if (!err) return next();
      const message = err.message || "Invalid upload";
      return res.status(400).json({ error: message });
    });
  },
  jobController.uploadCustomerSignature
);
router.post("/:id/rate", authenticate(["customer"]), jobController.rateJob);
router.get(
  "/:id/activity-detail",
  authenticate(["technician"]),
  jobController.getActivityDetail
);
router.get("/:id", authenticate(["customer", "technician"]), jobController.getJobById);

router.post("/:id/arrive", authenticate(["technician"]), jobController.markArrived);
router.post("/:id/start", authenticate(["technician"]), jobController.startJob);
router.post("/:id/repairs", authenticate(["technician"]), jobController.addRepairProcedure);
router.get("/:id/total", authenticate(["technician", "customer"]), jobController.calculateTotal);
router.post("/:id/complete", authenticate(["technician"]), jobController.markCompleted);
router.post("/:id/cancel", authenticate(["technician"]), jobController.cancelJobByTechnician);
router.post("/:id/payment", authenticate(["technician"]), jobController.confirmPayment);

router.get("/technicians/nearby", authenticate(["customer", "technician"]), jobController.findNearbyTechnicians);

module.exports = router;
