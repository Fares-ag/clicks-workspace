const { Receipt } = require("../../../clicks-shared/models");

const generateReceipt = async (req, res) => {
  try {
    const { job_id, customer_id, technician_id, total_amount, items, notes } = req.body;
    const receipt = new Receipt({
      job_id,
      customer_id,
      technician_id,
      total_amount,
      payment_status: "confirmed",
      items,
      notes
    });
    await receipt.save();
    res.status(201).json({ message: "Receipt generated", receipt });
  } catch (err) {
    res.status(500).json({ error: "Generate receipt failed", details: err.message });
  }
};

const getReceipt = async (req, res) => {
  try {
    const { id } = req.params;
    const receipt = await Receipt.findById(id);
    if (!receipt) {
      return res.status(404).json({ error: "Receipt not found" });
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
  generateReceipt,
  getReceipt,
  getReceiptByJob,
  downloadReceipt
};
