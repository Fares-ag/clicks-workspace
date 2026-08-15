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
  },
  { timestamps: true }
);

LeadSchema.index({ status: 1, createdAt: -1 });
LeadSchema.index({ clientMobileNumber: 1 });
LeadSchema.index(
  { service_request_id: 1 },
  { unique: true, sparse: true }
);
LeadSchema.index({ job_id: 1 }, { sparse: true });

const Lead = mongoose.model("Lead", LeadSchema);
Lead.OPEN_LEAD_STATUSES = OPEN_LEAD_STATUSES;
module.exports = Lead;