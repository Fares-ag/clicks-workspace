const { Job, Receipt } = require("../../../clicks-shared/models");
const { assertJobAccess, sameId } = require("../utils/ownership");

// A caller may read a receipt only when they are a party to it: named on the
// receipt itself (settlement receipts have no job_id), or a participant on the
// parent job.
const canAccessReceipt = async (receipt, user) => {
  if (!receipt || !user) return false;
  if (user.role === "technician" && sameId(receipt.technician_id, user.id)) return true;
  if (user.role === "customer" && sameId(receipt.customer_id, user.id)) return true;
  if (!receipt.job_id) return false;
  const job = await Job.findById(receipt.job_id);
  return assertJobAccess(job, user);
};

const getReceipt = async (req, res) => {
  try {
    const { id } = req.params;
    const receipt = await Receipt.findById(id);
    if (!receipt) {
      return res.status(404).json({ error: "Receipt not found" });
    }
    if (!(await canAccessReceipt(receipt, req.user))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    res.json({ receipt });
  } catch (err) {
    res.status(500).json({ error: "Fetch receipt failed", details: err.message });
  }
};

const getReceiptByJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const receipt = await Receipt.findOne({ job_id: jobId }).sort({ createdAt: -1 });
    if (!receipt) {
      return res.status(404).json({ error: "Receipt not found for job" });
    }
    if (!(await canAccessReceipt(receipt, req.user))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    res.json({ receipt });
  } catch (err) {
    res.status(500).json({ error: "Fetch receipt failed", details: err.message });
  }
};

// Placeholder for PDF download
const downloadReceipt = async (req, res) => {
  res.status(501).json({ error: "PDF download not implemented" });
};

module.exports = {
  getReceipt,
  getReceiptByJob,
  downloadReceipt
};
