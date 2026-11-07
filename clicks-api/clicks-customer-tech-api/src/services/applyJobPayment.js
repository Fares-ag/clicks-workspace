const {
  Job,
  Receipt,
  RepairProcedure,
} = require("../../../clicks-shared/models");
const { computeJobPricing } = require("../../../clicks-shared/utils/jobPricing");
const {
  deletePayloadCacheKey,
} = require("../../../clicks-shared/utils/payloadCache");

function invalidateTechSessionCache(technicianId) {
  if (!technicianId) return;
  deletePayloadCacheKey(`clicks:tech:payload:session:${technicianId}`).catch(
    () => {}
  );
}

async function existingReceipt(jobId) {
  return Receipt.findOne({ job_id: jobId }).sort({ issued_at: -1 });
}

async function applyJobPayment(job, {
  paymentMethod = "card",
  notes,
  skipcash,
  notify,
} = {}) {
  if (!job) {
    return { alreadyPaid: false, job: null, receipt: null };
  }

  if (job.payment_status === "paid") {
    return {
      alreadyPaid: true,
      job,
      receipt: await existingReceipt(job._id),
    };
  }

  const set = {
    payment_status: "paid",
    paid_at: new Date(),
    payment_method: paymentMethod,
  };
  if (skipcash && typeof skipcash === "object") {
    if (skipcash.payment_id != null) set["skipcash.payment_id"] = skipcash.payment_id;
    if (skipcash.pay_url != null) set["skipcash.pay_url"] = skipcash.pay_url;
    if (skipcash.transaction_id != null) {
      set["skipcash.transaction_id"] = skipcash.transaction_id;
    }
    if (skipcash.status_id != null) set["skipcash.status_id"] = skipcash.status_id;
    if (skipcash.visa_id != null) set["skipcash.visa_id"] = skipcash.visa_id;
    if (skipcash.amount != null) set["skipcash.amount"] = skipcash.amount;
  }

  const updated = await Job.findOneAndUpdate(
    { _id: job._id, payment_status: { $ne: "paid" } },
    { $set: set },
    { new: true }
  );

  if (!updated) {
    const fresh = await Job.findById(job._id);
    return {
      alreadyPaid: true,
      job: fresh,
      receipt: await existingReceipt(job._id),
    };
  }

  invalidateTechSessionCache(updated.assignedTechnician);

  const repairs = await RepairProcedure.find({ job_id: updated._id });
  const pricing = computeJobPricing(updated, repairs);
  let receipt = null;
  if (updated.assignedTechnician) {
    try {
      receipt = await Receipt.create({
        job_id: updated._id,
        customer_id: updated.customer_id,
        technician_id: updated.assignedTechnician,
        total_amount: pricing.total,
        payment_status: "paid",
        items: repairs.map((r) => ({
          description: r.description,
          quantity: r.quantity,
          price: r.price,
          receipt_image_url: r.receipt_image_url,
        })),
        notes: notes || undefined,
      });
    } catch (err) {
      if (err.code !== 11000) throw err;
      receipt = await existingReceipt(updated._id);
    }
  }

  if (updated.customer_id && typeof notify === "function") {
    await notify(updated.customer_id.toString(), "paymentConfirmed", {
      job_id: updated._id.toString(),
      job_status: updated.job_status,
      payment_status: "paid",
      payment_method: updated.payment_method,
      total_amount: pricing.total,
    });
  }

  return { alreadyPaid: false, job: updated, receipt, pricing };
}

module.exports = {
  applyJobPayment,
  invalidateTechSessionCache,
};
