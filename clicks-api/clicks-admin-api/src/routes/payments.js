const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const { requireFullAdmin } = require("../middleware/rbac");
const ctrl = require("../controllers/paymentAdminController");

const fullAdmin = [authenticateToken, requireFullAdmin];

// Refund cases. Requesting is open to full admins; approving needs Super Admin
// (or the finance "admin" role in the finance portal) and a different person
// from the requester — enforced in the refund service.
router.get("/refunds", ...fullAdmin, ctrl.listRefundsHandler);
router.post("/refunds", ...fullAdmin, ctrl.requestRefundHandler);
router.get("/refunds/:id", ...fullAdmin, ctrl.getRefundHandler);
router.post("/refunds/:id/approve", ...fullAdmin, ctrl.approveRefundHandler);
router.post("/refunds/:id/reject", ...fullAdmin, ctrl.rejectRefundHandler);
router.get("/refunds/:id/credit-note", ...fullAdmin, ctrl.creditNotePdfHandler);

// Payment attempt ledger (?job_id=, ?subscription_id=, ?stale=1 for >48h pending).
router.get("/payment-attempts", ...fullAdmin, ctrl.listJobAttempts);

// Outbox events that exhausted their retries, and replay.
router.get("/outbox/failed", ...fullAdmin, ctrl.listFailedOutbox);
router.post("/outbox/:id/replay", ...fullAdmin, ctrl.replayOutbox);

module.exports = router;
