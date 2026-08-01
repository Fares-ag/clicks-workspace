const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const { requireOps } = require("../middleware/rbac");
const serviceRequestController = require("../controllers/serviceRequestController");

router.get(
  "/",
  authenticateToken,
  requireOps,
  serviceRequestController.getServiceRequests
);
router.get(
  "/:id",
  authenticateToken,
  requireOps,
  serviceRequestController.getServiceRequestById
);

module.exports = router;
