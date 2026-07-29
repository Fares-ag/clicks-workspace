const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const { requireOps } = require("../middleware/rbac");
const Receipt = require("../../../clicks-shared/models/Receipt");

// GET /api/receipts/job/:jobId — admin UI parity with customer-tech
router.get("/job/:jobId", authenticateToken, requireOps, async (req, res) => {
  try {
    const receipt = await Receipt.findOne({ job_id: req.params.jobId }).sort({
      createdAt: -1,
    });
    if (!receipt) {
      return res.status(404).json({ error: "Receipt not found for job" });
    }
    res.json({ receipt });
  } catch (err) {
    res.status(500).json({ error: "Fetch receipt failed", details: err.message });
  }
});

module.exports = router;
