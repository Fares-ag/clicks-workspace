const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const serviceRequestController = require("../controllers/serviceRequestController");

router.post(
  "/",
  authenticate(["customer"]),
  serviceRequestController.createServiceRequest
);
router.get(
  "/active",
  authenticate(["customer"]),
  serviceRequestController.getActiveServiceRequest
);
router.post(
  "/:id/cancel",
  authenticate(["customer"]),
  serviceRequestController.cancelServiceRequest
);

module.exports = router;
