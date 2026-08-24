const express = require("express");
const router = express.Router();
const receiptController = require("../controllers/receiptController");
const { authenticate } = require("../middleware/auth");
const {
  requireApprovedTechnicianIfTechnician,
} = require("../middleware/requireApprovedTechnician");

// A technician token outlives the application it was issued against, so the
// technician side of these shared routes re-checks that the account is still
// Approved and active. Customer tokens pass through untouched.
const customerOrApprovedTechnician = [
  authenticate(["customer", "technician"]),
  requireApprovedTechnicianIfTechnician,
];

// POST / removed: receipts are created server-side only, by confirmPayment and
// ensureCompletionReceipt, from computeJobPricing.
// Static path before /:id
router.get(
  "/job/:jobId",
  customerOrApprovedTechnician,
  receiptController.getReceiptByJob
);
router.get("/:id", customerOrApprovedTechnician, receiptController.getReceipt);
router.get(
  "/:id/download",
  customerOrApprovedTechnician,
  receiptController.downloadReceipt
);

module.exports = router;
