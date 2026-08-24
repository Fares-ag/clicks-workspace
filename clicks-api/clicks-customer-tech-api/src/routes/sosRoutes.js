const express = require("express");
const router = express.Router();
const sosController = require("../controllers/sosController");
const { authenticate } = require("../middleware/auth");
const { authenticateInternal } = require("../middleware/internalAuth");

// Customer routes - get history
router.get("/", authenticate(["customer"]), sosController.getSOSRequests);

// Technician routes - get history (static path before /:id)
router.get("/technician/history", authenticate(["technician"]), sosController.getTechnicianSOSRequests);

// Notify claim / in_call (called from admin-api after REST claim)
router.post("/notify-claim", authenticateInternal, async (req, res) => {
  try {
    const { sos_id, admin_id, customer_id } = req.body;
    if (!sos_id) {
      return res.status(400).json({ message: "sos_id is required" });
    }
    const notifySosClaimed = req.app.get("notifySosClaimed");
    if (!notifySosClaimed) {
      return res.status(500).json({ message: "Socket service not initialized" });
    }
    await notifySosClaimed({ sos_id, admin_id, customer_id });
    res.json({ message: "Claim notified" });
  } catch (error) {
    console.error("Error notifying SOS claim:", error);
    res.status(500).json({ message: "Failed to notify claim", error: error.message });
  }
});

// Notify technician endpoint (called from admin-api after job creation)
router.post("/notify-technician", authenticateInternal, async (req, res) => {
  try {
    const { job_id } = req.body;

    if (!job_id) {
      return res.status(400).json({ message: "job_id is required" });
    }

    // Get the notify function from app
    const notifyAssignedTechnician = req.app.get("notifyAssignedTechnician");

    if (!notifyAssignedTechnician) {
      console.error("notifyAssignedTechnician function not found");
      return res.status(500).json({ message: "Socket service not initialized" });
    }

    await notifyAssignedTechnician(job_id);

    res.json({ message: "Technician notified successfully" });
  } catch (error) {
    console.error("Error notifying technician:", error);
    res.status(500).json({ message: "Failed to notify technician", error: error.message });
  }
});

// Notify admins of a new business-portal lead (called from admin-api after portal create)
router.post("/notify-business-lead", authenticateInternal, async (req, res) => {
  try {
    const payload = req.body;
    if (!payload?.lead_id) {
      return res.status(400).json({ message: "lead_id is required" });
    }
    const notifyAdminBusinessLead = req.app.get("notifyAdminBusinessLead");
    if (!notifyAdminBusinessLead) {
      return res.status(500).json({ message: "Socket service not initialized" });
    }
    notifyAdminBusinessLead(payload);
    res.json({ message: "Admins notified" });
  } catch (error) {
    console.error("Error notifying business lead:", error);
    res.status(500).json({
      message: "Failed to notify business lead",
      error: error.message,
    });
  }
});

// Legacy alias — older admin-api builds may still call this after creating a job
router.post("/notify-business-job", authenticateInternal, async (req, res) => {
  try {
    const payload = req.body;
    if (!payload?.job_id && !payload?.lead_id) {
      return res.status(400).json({ message: "job_id or lead_id is required" });
    }
    const notifyAdminBusinessLead = req.app.get("notifyAdminBusinessLead");
    const notifyAdminBusinessJob = req.app.get("notifyAdminBusinessJob");
    if (payload.lead_id && notifyAdminBusinessLead) {
      notifyAdminBusinessLead(payload);
    } else if (notifyAdminBusinessJob) {
      notifyAdminBusinessJob(payload);
    } else {
      return res.status(500).json({ message: "Socket service not initialized" });
    }
    res.json({ message: "Admins notified" });
  } catch (error) {
    console.error("Error notifying business job:", error);
    res.status(500).json({
      message: "Failed to notify business job",
      error: error.message,
    });
  }
});

// Parametric routes last
router.get("/:id", authenticate(["customer", "technician"]), sosController.getSOSRequestById);

module.exports = router;
