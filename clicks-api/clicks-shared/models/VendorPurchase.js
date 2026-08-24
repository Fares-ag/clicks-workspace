const mongoose = require("mongoose");

/**
 * Finance-owned purchase ledger row: what was bought, from which vendor, for
 * which job, in what quantity. Separate from finance_extra_costs so finance
 * can track supplier spend with qty × unit cost without overloading misc rows.
 */
const VendorPurchaseSchema = new mongoose.Schema(
  {
    job_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
      index: true,
    },
    vendor_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
      index: true,
    },
    description: { type: String, required: true, trim: true, maxlength: 300 },
    sku: { type: String, default: "", trim: true, maxlength: 80 },
    quantity: { type: Number, required: true, min: 0 },
    unit_cost: { type: Number, required: true, min: 0 },
    // Stored total (qty × unit_cost) for stable audit snapshots.
    total_cost: { type: Number, required: true, min: 0 },
    receipt_ref: { type: String, default: "", trim: true, maxlength: 120 },
    purchased_at: { type: Date, default: Date.now },
    notes: { type: String, default: "", maxlength: 500 },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FinanceUser",
      default: null,
    },
    is_void: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

VendorPurchaseSchema.index({ job_id: 1, is_void: 1, purchased_at: -1 });
VendorPurchaseSchema.index({ vendor_id: 1, is_void: 1, purchased_at: -1 });
VendorPurchaseSchema.index({ description: "text", sku: "text", receipt_ref: "text" });

module.exports = mongoose.model("VendorPurchase", VendorPurchaseSchema);
