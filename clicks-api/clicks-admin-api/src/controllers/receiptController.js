const Job = require("clicks-shared/models/Job");
const Receipt = require("clicks-shared/models/Receipt");
const RepairProcedure = require("clicks-shared/models/RepairProcedure");
const { computeJobPricing } = require("clicks-shared/utils/jobPricing");
const {
  buildReceiptPdf,
  receiptFilename,
} = require("clicks-shared/services/receiptPdf");

function withPdfUrl(receipt, jobId) {
  const row = typeof receipt.toObject === "function" ? receipt.toObject() : { ...receipt };
  row.pdf_url = `/api/receipts/${row._id}/download`;
  if (jobId) {
    row.job_pdf_url = `/api/receipts/job/${jobId}/download`;
  }
  return row;
}

function sendPdf(res, { receipt, job, repairs }) {
  const pdf = buildReceiptPdf({ receipt, job: job || {}, repairs });
  const filename = receiptFilename(job || {}, receipt || {});
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.send(pdf);
}

async function loadJob(jobId) {
  return Job.findById(jobId)
    .populate("assignedTechnician", "firstName lastName")
    .populate("membership.subscription_id", "planName planCode")
    .lean();
}

function snapshotReceipt(job, repairs) {
  const pricing = computeJobPricing(job, repairs);
  return {
    _id: job._id,
    job_id: job._id,
    total_amount: pricing.total,
    payment_status: job.payment_status || "unpaid",
    issued_at: job.completed_at || job.paid_at || job.dateTime || new Date(),
    items: repairs.map((row) => ({
      description: row.description || row.name || "Repair",
      quantity: row.quantity,
      price: row.price,
    })),
  };
}

const getReceiptByJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const receipt = await Receipt.findOne({ job_id: jobId }).sort({
      createdAt: -1,
      issued_at: -1,
    });
    if (!receipt) {
      return res.status(404).json({ error: "Receipt not found for job" });
    }
    const row = withPdfUrl(receipt, jobId);
    return res.json({
      receipt: row,
      pdf_url: `/api/receipts/job/${jobId}/download`,
    });
  } catch (err) {
    return res.status(500).json({ error: "Fetch receipt failed", details: err.message });
  }
};

const downloadReceiptByJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await loadJob(jobId);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
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
    return res.status(500).json({ error: "PDF download failed", details: err.message });
  }
};

const downloadReceipt = async (req, res) => {
  try {
    const { id } = req.params;
    const receipt = await Receipt.findById(id).lean();
    if (!receipt) {
      return res.status(404).json({ error: "Receipt not found" });
    }
    const job = receipt.job_id ? await loadJob(receipt.job_id) : {};
    const repairs = receipt.job_id
      ? await RepairProcedure.find({ job_id: receipt.job_id }).lean()
      : [];
    return sendPdf(res, { receipt, job: job || {}, repairs });
  } catch (err) {
    return res.status(500).json({ error: "PDF download failed", details: err.message });
  }
};

module.exports = {
  getReceiptByJob,
  downloadReceiptByJob,
  downloadReceipt,
};
