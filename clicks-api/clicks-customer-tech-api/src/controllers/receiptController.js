const { Job, Receipt, RepairProcedure } = require("../../../clicks-shared/models");
const { assertJobAccess, sameId } = require("../utils/ownership");
const {
  buildReceiptPdf,
  receiptFilename,
} = require("clicks-shared/services/receiptPdf");

const canAccessReceipt = async (receipt, user) => {
  if (!receipt || !user) return false;
  if (user.role === "technician" && sameId(receipt.technician_id, user.id)) return true;
  if (user.role === "customer" && sameId(receipt.customer_id, user.id)) return true;
  if (!receipt.job_id) return false;
  const job = await Job.findById(receipt.job_id);
  return assertJobAccess(job, user);
};

function withPdfUrl(receipt) {
  const row = typeof receipt.toObject === "function" ? receipt.toObject() : { ...receipt };
  row.pdf_url = `/api/receipts/${row._id}/download`;
  return row;
}

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
    res.json({ receipt: withPdfUrl(receipt) });
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
    res.json({ receipt: withPdfUrl(receipt) });
  } catch (err) {
    res.status(500).json({ error: "Fetch receipt failed", details: err.message });
  }
};

const downloadReceipt = async (req, res) => {
  try {
    const { id } = req.params;
    const receipt = await Receipt.findById(id);
    if (!receipt) {
      return res.status(404).json({ error: "Receipt not found" });
    }
    if (!(await canAccessReceipt(receipt, req.user))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const job = receipt.job_id
      ? await Job.findById(receipt.job_id)
          .populate("assignedTechnician", "firstName lastName")
          .populate("membership.subscription_id", "planName planCode")
          .lean()
      : {};
    const repairs = receipt.job_id
      ? await RepairProcedure.find({ job_id: receipt.job_id }).lean()
      : [];
    const receiptDoc =
      typeof receipt.toObject === "function" ? receipt.toObject() : receipt;
    const pdf = buildReceiptPdf({
      receipt: receiptDoc,
      job: job || {},
      repairs,
    });
    const filename = receiptFilename(job || {}, receiptDoc);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(pdf);
  } catch (err) {
    res.status(500).json({ error: "PDF download failed", details: err.message });
  }
};

module.exports = {
  getReceipt,
  getReceiptByJob,
  downloadReceipt,
};
