const mongoose = require("mongoose");
const { ALL_JOB_TYPES } = require("../constants/jobTypes");

const JobSchema = new mongoose.Schema(
  {
    // Technician-entered Job ID (typed in before completing the job). This is
    // the job's display name everywhere (finance, admin, business portal, both
    // apps); legacy rows are blank and clients fall back to "#" + last 6 of _id.
    job_reference: { type: String, default: "", trim: true, maxlength: 64, index: true },
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
    // Parsed GeoJSON Point from location string — [longitude, latitude]
    // Only set when both type and coordinates are present (no partial default).
    locationCoordinates: {
      type: {
        type: String,
        enum: ["Point"],
      },
      coordinates: {
        type: [Number],
      },
    },
    dateTime: { type: Date, required: true },
    jobType: {
      type: String,
      enum: ALL_JOB_TYPES,
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
    // Job Status Flow: pending → assigned → accepted → en_route → arrived → in_progress → completed
    // Hold branch: accepted|en_route|arrived|in_progress → on_hold → (resume restores prior status)
    // Terminals: completed | cancelled
    job_status: {
      type: String,
      enum: ["pending", "assigned", "accepted", "en_route", "arrived", "in_progress", "on_hold", "completed", "cancelled"],
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
    // Cancellation audit — admin UI (JobDetails "Cancellation Reason") reads these.
    // Without the declarations strict mode silently dropped every write.
    cancelled_at: { type: Date, default: null },
    cancellation_reason: { type: String, default: "" },
    cancelled_by: {
      type: String,
      enum: ["admin", "technician", "customer"],
      default: undefined,
    },
    // On-hold audit — resume restores status_before_hold; hold_reason is kept after resume.
    status_before_hold: { type: String, default: null },
    on_hold_at: { type: Date, default: null },
    hold_reason: { type: String, maxlength: 2000, default: "" },
    scheduled_return_at: { type: Date, default: null },
    held_by: {
      type: String,
      enum: ["admin", "technician"],
      default: undefined,
    },
    resumed_at: { type: Date, default: null },
    // Technician-initiated hold request — job stays active until admin approves.
    hold_request: {
      status: {
        type: String,
        enum: ["pending", "approved", "rejected", null],
        default: undefined,
      },
      reason: { type: String, maxlength: 2000, default: "" },
      requested_at: { type: Date, default: null },
      requested_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Technician",
        default: null,
      },
      decided_at: { type: Date, default: null },
      decided_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Admin",
        default: null,
      },
      decision_note: { type: String, maxlength: 2000, default: "" },
    },
    task_description: { type: String },
    rejection_reasons: [{ type: String }],
    rejection_description: { type: String, maxlength: 500 },
    payment_method: {
      type: String,
      enum: ["card", "wallet", "cash", "fawran"],
    },
    rating: { type: Number, min: 1, max: 5 },
    rating_description: { type: String, maxlength: 500, default: "" },
    sos_request_id: { type: mongoose.Schema.Types.ObjectId, ref: "SOSRequest" },
    service_request_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServiceRequest",
    },
    lead_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lead",
      default: null,
    },
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
    // Legacy system job id (historical Excel import) — left unset on normal jobs.
    // Uniqueness comes from the partial index below; no path-level index here,
    // otherwise mongoose declares two conflicting {legacy_id:1} indexes.
    legacy_id: { type: Number },
    // Technician name from legacy export when no matching Technician record exists
    legacyTechnicianName: { type: String, default: "" },
    // Finance portal audit (completed jobs only)
    finance_status: {
      type: String,
      enum: ["pending", "audited"],
      default: "pending",
    },
    finance_revenue: { type: Number, default: null },
    finance_cost_total: { type: Number, default: null },
    finance_net_profit: { type: Number, default: null },
    finance_extra_costs: [
      {
        label: { type: String, default: "" },
        amount: { type: Number, default: 0 },
        // Optional supplier this cost row is attributed to (finance portal)
        vendor_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Vendor",
          default: null,
        },
      },
    ],
    finance_notes: { type: String, default: "", maxlength: 2000 },
    finance_audited_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FinanceUser",
      default: null,
    },
    finance_audited_at: { type: Date, default: null },
    // Re-audit trail — an already-audited job can be edited again through the
    // separate re-audit endpoint, which always requires a reason.
    finance_reaudit_count: { type: Number, default: 0 },
    finance_last_reaudit_reason: { type: String, default: "", maxlength: 1000 },
    finance_last_reaudited_at: { type: Date, default: null },
    // Normalized search digests — set by pre-save hook and write paths (admin jobs prefix search)
    search_phone: { type: String, default: "", index: true },
    search_name: { type: String, default: "", index: true },
  },
  { timestamps: true }
);

const { computeJobSearchFields } = require("../utils/searchFields");

JobSchema.pre("save", function jobSearchFieldsPreSave(next) {
  const fields = computeJobSearchFields(this);
  this.search_phone = fields.search_phone;
  this.search_name = fields.search_name;
  next();
});

// admin getJobs unfiltered: Job.find({}).sort({ createdAt: -1 })
JobSchema.index({ createdAt: -1 });
// dashboard revenue paid_at window: { job_status ∈ COMPLETED, paid_at: range }
JobSchema.index({ job_status: 1, paid_at: -1 });
// dashboard revenue completed_at fallback: { job_status ∈ COMPLETED, paid_at absent, completed_at: range }
JobSchema.index({ job_status: 1, completed_at: -1 });
// tech-api getCustomerJobs: Job.find({ customer_id }).sort({ dateTime: -1 })
JobSchema.index({ customer_id: 1, dateTime: -1 });
// admin jobs prefix search on businessName
JobSchema.index({ businessName: 1 });
// business portal conditional polling freshness probe
JobSchema.index({ business_id: 1, updatedAt: -1 });

JobSchema.index({ job_status: 1, assignedTechnician: 1, createdAt: -1 });
// tech session + dashboard counts: Job.find({ assignedTechnician, job_status })
JobSchema.index({ assignedTechnician: 1, job_status: 1 });
// dashboard pending queue: Job.find({ job_status: "pending" }).sort({ dateTime: 1 })
JobSchema.index({ job_status: 1, dateTime: 1 });
JobSchema.index({ customer_id: 1, createdAt: -1 });
JobSchema.index({ business_id: 1, createdAt: -1 });
// Idempotency guard for the historical import. Explicitly named so it does not
// collide with the stale `legacy_id_1` index left by the old sparse declaration
// (same key + different options = IndexOptionsConflict, and the unique index
// would never build). Partial on $type:number so null/absent values are ignored.
JobSchema.index(
  { legacy_id: 1 },
  {
    unique: true,
    name: "legacy_id_unique",
    partialFilterExpression: { legacy_id: { $type: "number" } },
  }
);
JobSchema.index({ locationCoordinates: "2dsphere" });
JobSchema.index({ dateTime: -1, job_status: 1 });
JobSchema.index({ job_status: 1, finance_status: 1, completed_at: -1 });
// finance jobs list/export payment_method filter (+ completed_at range & sort)
JobSchema.index({ job_status: 1, payment_method: 1, completed_at: -1 });
// finance jobs list/export vendor_id filter — multikey over the cost rows
JobSchema.index({ "finance_extra_costs.vendor_id": 1 });
// job_reference is indexed at the path level (index: true) — no schema-level
// declaration here, otherwise mongoose builds two identical job_reference_1.

module.exports = mongoose.model("Job", JobSchema);
