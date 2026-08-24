const mongoose = require("mongoose");

const OPEN_LEAD_STATUSES = ["new", "contacted", "qualified"];

const LeadSchema = new mongoose.Schema(
  {
    clientName: { type: String, required: true, trim: true },
    clientMobileNumber: { type: String, required: true, trim: true },
    clientEmail: { type: String, default: "" },
    inquiry: { type: String, required: true, trim: true },
    internalNotes: { type: String, default: "", maxlength: 2000 },
    serviceType: { type: String, default: "" },
    timing: {
      type: String,
      enum: ["immediate", "scheduled"],
    },
    preferredDateTime: { type: Date, default: null },
    location: { type: String, default: "" },
    vehicleMake: { type: String, default: "" },
    vehicleModel: { type: String, default: "" },
    vehicleYear: { type: Number, default: null },
    licensePlate: { type: String, default: "" },
    vinNumber: { type: String, default: "" },
    source: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Source",
      required: true,
    },
    subSource: { type: String, default: "" },
    customer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
    },
    customer_vehicle_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CustomerVehicle",
      default: null,
    },
    service_request_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServiceRequest",
    },
    job_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
    },
    status: {
      type: String,
      enum: ["new", "contacted", "qualified", "converted", "lost"],
      default: "new",
    },
    lost_reason: { type: String, default: "" },
    converted_at: { type: Date, default: null },
    converted_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    assigned_to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    // Business portal provenance — stamped when partner submits a request
    business_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      default: null,
    },
    businessName: { type: String, default: null },
    businessCutType: { type: String, default: undefined },
    businessCutPercent: { type: Number, default: undefined },
    created_by_business_user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessUser",
      default: null,
    },
    /** Partner-quoted price; used to prefill convert-to-job. */
    proposedPrice: { type: Number, default: null },
    search_phone: { type: String, default: "", index: true },
    search_name: { type: String, default: "", index: true },
  },
  { timestamps: true }
);

const { computeLeadSearchFields } = require("../utils/searchFields");

LeadSchema.pre("save", function leadSearchFieldsPreSave(next) {
  const fields = computeLeadSearchFields(this);
  this.search_phone = fields.search_phone;
  this.search_name = fields.search_name;
  next();
});

// leadController unfiltered list: Lead.find({}).sort({ createdAt: -1 })
LeadSchema.index({ createdAt: -1 });
// business portal conditional polling freshness probe
LeadSchema.index({ business_id: 1, updatedAt: -1 });

LeadSchema.index({ status: 1, createdAt: -1 });
LeadSchema.index({ clientMobileNumber: 1 });
LeadSchema.index({ business_id: 1, createdAt: -1 });
LeadSchema.index(
  { service_request_id: 1 },
  { unique: true, sparse: true }
);
LeadSchema.index({ job_id: 1 }, { sparse: true });

const Lead = mongoose.model("Lead", LeadSchema);
Lead.OPEN_LEAD_STATUSES = OPEN_LEAD_STATUSES;
module.exports = Lead;