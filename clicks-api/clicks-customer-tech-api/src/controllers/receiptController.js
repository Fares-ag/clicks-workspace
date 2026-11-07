const { Job, Receipt, RepairProcedure } = require("../../../clicks-shared/models");
const { assertJobAccess, sameId } = require("../utils/ownership");
const { computeJobPricing } = require("clicks-shared/utils/jobPricing");
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

function withPdfUrl(receipt, jobId) {
  const row = typeof receipt.toObject === "function" ? receipt.toObject() : { ...receipt };
  row.pdf_url = `/api/receipts/${row._id}/download`;
  if (jobId) {
    row.job_pdf_url = `/api/receipts/job/${jobId}/download`;
  }
  return row;
}

async function loadJob(jobId) {
  return Job.findById(jobId)
    .populate("assignedTechnician", "firstName lastName")
    .populate("customer_id", "first_name last_name phone_number email client_id")
    .lean();
}

function snapshotReceipt(job, repairs) {
  const pricing = computeJobPricing(job, repairs);
  return {
    _id: job._id,
    job_id: job._id,
    customer_id: job.customer_id && job.customer_id._id ? job.customer_id._id : job.customer_id,
    total_amount: pricing.total,
    payment_status: job.payment_status || "unpaid",
    issued_at: job.completed_at || job.paid_at || job.dateTime || new Date(),
    items: repairs.map((row) => ({
      description: row.description || row.name || "Repair",
      quantity: row.quantity,
      price: row.price,
      receipt_image_url: row.receipt_image_url,
    })),
  };
}

async function sendPdf(res, { receipt, job, repairs }) {
  const pdf = await buildReceiptPdf({ receipt, job: job || {}, repairs });
  const filename = receiptFilename(job || {}, receipt || {});
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.send(pdf);
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
    res.json({ receipt: withPdfUrl(receipt, receipt.job_id) });
  } catch (err) {
    res.status(500).json({ error: "Fetch receipt failed", details: err.message });
  }
};

const getReceiptByJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await loadJob(jobId);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    if (!assertJobAccess(job, req.user)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const receipt = await Receipt.findOne({ job_id: jobId }).sort({ createdAt: -1 });
    if (receipt) {
      if (!(await canAccessReceipt(receipt, req.user))) {
        return res.status(403).json({ error: "Forbidden" });
      }
      return res.json({
        receipt: withPdfUrl(receipt, jobId),
        pdf_url: `/api/receipts/job/${jobId}/download`,
      });
    }
    if (job.job_status !== "completed") {
      return res.status(404).json({ error: "Receipt not found for job" });
    }
    const repairs = await RepairProcedure.find({ job_id: job._id }).lean();
    const snapshot = snapshotReceipt(job, repairs);
    return res.json({
      receipt: {
        ...snapshot,
        pdf_url: `/api/receipts/job/${jobId}/download`,
      },
      pdf_url: `/api/receipts/job/${jobId}/download`,
    });
  } catch (err) {
    res.status(500).json({ error: "Fetch receipt failed", details: err.message });
  }
};

const downloadReceiptByJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await loadJob(jobId);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    if (!assertJobAccess(job, req.user)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const receipt = await Receipt.findOne({ job_id: job._id }).sort({
      createdAt: -1,
      issued_at: -1,
    }).lean();
    if (!receipt && job.job_status !== "completed") {
      return res.status(400).json({
        error: "Receipt can only be downloaded for completed jobs",
      });
    }
    const repairs = await RepairProcedure.find({ job_id: job._id }).lean();
    const receiptDoc = receipt || snapshotReceipt(job, repairs);
    return sendPdf(res, { receipt: receiptDoc, job, repairs });
  } catch (err) {
    res.status(500).json({ error: "PDF download failed", details: err.message });
  }
};

const downloadReceipt = async (req, res) => {
  try {
    const { id } = req.params;
    let receipt = await Receipt.findById(id);
    if (!receipt) {
      const job = await loadJob(id);
      if (!job) {
        return res.status(404).json({ error: "Receipt not found" });
      }
      if (!assertJobAccess(job, req.user)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      if (job.job_status !== "completed") {
        return res.status(400).json({
          error: "Receipt can only be downloaded for completed jobs",
        });
      }
      const repairs = await RepairProcedure.find({ job_id: job._id }).lean();
      return sendPdf(res, { receipt: snapshotReceipt(job, repairs), job, repairs });
    }
    if (!(await canAccessReceipt(receipt, req.user))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const job = receipt.job_id ? await loadJob(receipt.job_id) : {};
    const repairs = receipt.job_id
      ? await RepairProcedure.find({ job_id: receipt.job_id }).lean()
      : [];
    const receiptDoc =
      typeof receipt.toObject === "function" ? receipt.toObject() : receipt;
    return sendPdf(res, { receipt: receiptDoc, job: job || {}, repairs });
  } catch (err) {
    res.status(500).json({ error: "PDF download failed", details: err.message });
  }
};

module.exports = {
  getReceipt,
  getReceiptByJob,
  downloadReceiptByJob,
  downloadReceipt,
};
