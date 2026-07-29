const express = require("express");
const router = express.Router();
const receiptController = require("../controllers/receiptController");
const { authenticate } = require("../middleware/auth");

router.post("/", authenticate(["technician"]), receiptController.generateReceipt);
// Static path before /:id
router.get(
  "/job/:jobId",
  authenticate(["customer", "technician"]),
  receiptController.getReceiptByJob
);
router.get("/:id", authenticate(["customer", "technician"]), receiptController.getReceipt);
router.get(
  "/:id/download",
  authenticate(["customer", "technician"]),
  receiptController.downloadReceipt
);

module.exports = router;
