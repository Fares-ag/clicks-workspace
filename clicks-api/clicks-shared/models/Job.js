const mongoose = require("mongoose");

const JobSchema = new mongoose.Schema(
  {
    clientName: { type: String, required: true },
    clientMobileNumber: { type: String, required: true },
    clientEmail: { type: String, default: "" },
    customer_id: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
    customer_vehicle_id: { type: mongoose.Schema.Types.ObjectId, ref: "CustomerVehicle" },
    // Vehicle snapshot (same fields collected on admin Add Job)
    vehicleMake: { type: String, default: "" },
    vehicleModel: { type: String, default: "" },
    vehicleYear: { type: Number, default: null },
    licensePlate: { type: String, default: "" },
    vinNumber: { type: String, default: "" },
    issue: { type: String, required: true },
    location: { type: String, required: true },
    dateTime: { type: Date, required: true },
    jobType: {
      type: String,
      enum: [
        "Tires",
        "Engines",
        "Gearbox",
        "keyless_car_opening",
        "tire_change",
      ],
      required: true
    },
    assignedTechnician: { type: mongoose.Schema.Types.ObjectId, ref: "Technician" },
    price: { type: Number, required: true },
    source: { type: mongoose.Schema.Types.ObjectId, ref: "Source", required: true },
    subSource: { type: String, default: "" },
    // Partner acquisition attribution (set when job credits a Partner)
    partner_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Partner",
      default: null,
    },
    // Job Status Flow: pending → assigned → accepted → en_route → arrived → in_progress → completed → cancelled
    job_status: {
      type: String,
      enum: ["pending", "assigned", "accepted", "en_route", "arrived", "in_progress", "completed", "cancelled"],
      default: "pending"
    },
    // Separate Payment Status: unpaid → paid
    payment_status: {
      type: String,
      enum: ["unpaid", "paid"],
      default: "unpaid"
    },
    // Timestamps for job flow tracking
    assigned_at: { type: Date },
    accepted_at: { type: Date },
    en_route_at: { type: Date },
    arrived_at: { type: Date },
    started_at: { type: Date },
    completed_at: { type: Date },
    paid_at: { type: Date },
    task_description: { type: String },
    rejection_reasons: [{ type: String }],
    rejection_description: { type: String, maxlength: 500 },
    payment_method: { type: String, enum: ["card", "wallet", "cash"] },
    rating: { type: Number, min: 1, max: 5 },
    rating_description: { type: String, maxlength: 500, default: "" },
    sos_request_id: { type: mongoose.Schema.Types.ObjectId, ref: "SOSRequest" },
    // Business portal — set when the job was submitted via a business portal
    business_id: { type: mongoose.Schema.Types.ObjectId, ref: "Business" },
    businessName: { type: String },
    created_by_business_user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessUser",
      default: null,
    },
    // Snapshot of business commission settings at job creation (optional)
    businessCutType: { type: String, enum: ["revenue", "profit"] },
    businessCutPercent: { type: Number, min: 0, max: 100 },
    // Technician-app created jobs (parallel to business portal)
    created_by_technician: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Technician",
      default: null,
    },
    createdByTechnicianName: { type: String, default: "" },
    // Soft-launch completion extras (filenames until media upload exists)
    completion_notes: { type: String, maxlength: 2000, default: "" },
    completion_photos: [{ type: String }],
    // Customer e-signature before job close
    customerSignatureUrl: { type: String, default: "" },
    customerSignedAt: { type: Date, default: null },
    customerSignatureInvalidatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

JobSchema.index({ job_status: 1, assignedTechnician: 1, createdAt: -1 });
JobSchema.index({ customer_id: 1, createdAt: -1 });
JobSchema.index({ business_id: 1, createdAt: -1 });

module.exports = mongoose.model("Job", JobSchema);
