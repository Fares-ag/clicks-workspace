const express = require("express");
const authenticateToken = require("../middleware/auth");
const { requireOps } = require("../middleware/rbac");
const leadController = require("../controllers/leadController");

const router = express.Router();

router.get("/", authenticateToken, requireOps, leadController.getLeads);
router.post("/", authenticateToken, requireOps, leadController.createLead);
router.get(
  "/by-service-request/:serviceRequestId",
  authenticateToken,
  requireOps,
  leadController.getLeadByServiceRequest
);
router.get("/:id", authenticateToken, requireOps, leadController.getLeadById);
router.patch("/:id", authenticateToken, requireOps, leadController.updateLead);
router.post(
  "/:id/convert",
  authenticateToken,
  requireOps,
  leadController.convertLead
);
router.post("/:id/lost", authenticateToken, requireOps, leadController.markLeadLost);

module.exports = router;
