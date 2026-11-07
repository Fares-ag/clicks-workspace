const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const { requireOps } = require("../middleware/rbac");
const receiptController = require("../controllers/receiptController");

const ops = [authenticateToken, requireOps];

router.get("/job/:jobId/download", ...ops, receiptController.downloadReceiptByJob);
router.get("/job/:jobId", ...ops, receiptController.getReceiptByJob);
router.get("/:id/download", ...ops, receiptController.downloadReceipt);

module.exports = router;
