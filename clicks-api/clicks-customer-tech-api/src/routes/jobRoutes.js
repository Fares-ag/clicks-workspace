const express = require("express");
const router = express.Router();
const jobController = require("../controllers/jobController");
const { authenticate } = require("../middleware/auth");
const {
  requireApprovedTechnician,
  requireApprovedTechnicianIfTechnician,
} = require("../middleware/requireApprovedTechnician");

// A technician token is issued at login whatever the application state, so the
// job lifecycle re-checks that the account is still Approved and still active
// on every request. Without this a rejected or self-deleted technician keeps
// working — and keeps reading the technician roster — for the 7-day life of the
// token they already hold.
const approvedTechnician = [authenticate(["technician"]), requireApprovedTechnician];
// Shared with customers: customer tokens pass through untouched.
const customerOrApprovedTechnician = [
  authenticate(["customer", "technician"]),
  requireApprovedTechnicianIfTechnician,
];

// Session resume endpoints (must be before /:id routes)
router.get("/customer/session", authenticate(["customer"]), jobController.getCustomerSession);
router.get("/customer/active", authenticate(["customer"]), jobController.getCustomerActiveJob);
router.get("/customer/active-sos", authenticate(["customer"]), jobController.getCustomerActiveSOS);
router.get("/technician/session", approvedTechnician, jobController.getTechnicianSession);
router.get("/technician/active", approvedTechnician, jobController.getTechnicianActiveJob);

// POST "/" (customer job self-creation) removed: it let a customer set the job
// price, pick the assigned technician and hijack any SOS request by id.
router.get("/", customerOrApprovedTechnician, jobController.getJobs);
router.get("/customer/history", authenticate(["customer"]), jobController.getCustomerJobs);
router.patch("/:id/status", approvedTechnician, jobController.updateJobStatus);
router.patch("/:id/details", approvedTechnician, jobController.updateJobDetails);
router.post(
  "/:id/signature",
  approvedTechnician,
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
  approvedTechnician,
  jobController.getActivityDetail
);
router.get("/:id", customerOrApprovedTechnician, jobController.getJobById);

router.post("/:id/arrive", approvedTechnician, jobController.markArrived);
router.post("/:id/start", approvedTechnician, jobController.startJob);
router.post("/:id/repairs", approvedTechnician, jobController.addRepairProcedure);
router.get("/:id/total", customerOrApprovedTechnician, jobController.calculateTotal);
router.post("/:id/complete", approvedTechnician, jobController.markCompleted);
router.post("/:id/cancel", approvedTechnician, jobController.cancelJobByTechnician);
router.post("/:id/payment", approvedTechnician, jobController.confirmPayment);
router.post("/:id/hold-request", approvedTechnician, jobController.requestHold);
router.delete(
  "/:id/hold-request",
  approvedTechnician,
  jobController.cancelHoldRequestHandler
);

router.get("/technicians/nearby", customerOrApprovedTechnician, jobController.findNearbyTechnicians);

module.exports = router;
