const mongoose = require("mongoose");

// Finance-owned supplier directory. Vendors are created and maintained from the
// finance portal only (no admin-console CRUD) and are referenced by the
// per-job finance_extra_costs rows, so deletion is soft (isActive=false).
const VendorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, default: "" },
    contactPerson: { type: String, default: "" },
    phone: { type: String, default: "" },
    email: { type: String, default: "", lowercase: true, trim: true },
    notes: { type: String, default: "", maxlength: 1000 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// finance vendors list: name search / alphabetical sort
VendorSchema.index({ name: 1 });
// finance vendors list default: { isActive: true } sorted by name
VendorSchema.index({ isActive: 1, name: 1 });

module.exports = mongoose.model("Vendor", VendorSchema);
