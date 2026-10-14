const mongoose = require("mongoose");
const {
  SETTLEMENT_PAYMENT_METHODS,
  SETTLEMENT_ENTRY_TYPES,
} = require("../utils/technicianSettlement");

// One job the settlement accounts for. `amount` is what the customer paid for
// the job excluding tip; battery_cost and garage_cost are the parts of that
// amount that are not the company's profit.
const SettlementJobSchema = new mongoose.Schema({
  // Null for a job typed in by hand (no matching job in the system).
  job_id: { type: mongoose.Schema.Types.ObjectId, ref: "Job", default: null },
  // Job reference snapshot for linked jobs, free description for manual ones.
  label: { type: String, default: "", maxlength: 200 },
  payment_method: { type: String, enum: SETTLEMENT_PAYMENT_METHODS, default: "cash" },
  amount: { type: Number, default: 0, min: 0 },
  battery_cost: { type: Number, default: 0, min: 0 },
  garage_cost: { type: Number, default: 0, min: 0 },
  tip: { type: Number, default: 0, min: 0 },
});

// Money that moved outside a job. The type decides which side it counts on.
const SettlementEntrySchema = new mongoose.Schema({
  type: { type: String, enum: SETTLEMENT_ENTRY_TYPES, required: true },
  amount: { type: Number, default: 0, min: 0 },
  // Qatar calendar day, YYYY-MM-DD; optional.
  date: { type: String, default: "" },
  note: { type: String, default: "", maxlength: 500 },
});

const SettlementHistorySchema = new mongoose.Schema(
  {
    action: { type: String, enum: ["create", "close", "reopen"], required: true },
    at: { type: Date, default: Date.now },
    finance_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FinanceUser",
      required: true,
    },
    cash_to_collect: { type: Number, default: null },
    collected: { type: Number, default: null },
    // Mandatory on "reopen".
    reason: { type: String, default: "", maxlength: 1000 },
  },
  { _id: false }
);

const TechnicianSettlementSchema = new mongoose.Schema(
  {
    technician_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Technician",
      required: true,
    },
    // Per-technician sequence ("Rawad #10"), so it can continue the sheet's numbering.
    number: { type: Number, required: true, min: 1 },
    // Qatar calendar days (YYYY-MM-DD). Stored as plain days rather than Dates
    // so a period never shifts by a day depending on the server's timezone.
    period_from: { type: String, required: true },
    period_to: { type: String, required: true },
    status: { type: String, enum: ["draft", "closed"], default: "draft" },
    jobs: { type: [SettlementJobSchema], default: [] },
    entries: { type: [SettlementEntrySchema], default: [] },
    // Derived from jobs[].job_id on every write; backs the one-job-one-settlement index.
    job_ids: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    notes: { type: String, default: "", maxlength: 2000 },
    // computeSettlementTotals() output, refreshed on every write so lists can
    // show the money without loading every line.
    totals: { type: mongoose.Schema.Types.Mixed, default: {} },
    // Cash the accountant actually received; set when the settlement is closed.
    collected_amount: { type: Number, default: null },
    // Bumped on every write. Clients send it back so a save or close never
    // silently overwrites edits made by someone else in the meantime.
    revision: { type: Number, default: 0 },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: "FinanceUser", default: null },
    closed_by: { type: mongoose.Schema.Types.ObjectId, ref: "FinanceUser", default: null },
    closed_at: { type: Date, default: null },
    history: { type: [SettlementHistorySchema], default: [] },
  },
  { timestamps: true }
);

TechnicianSettlementSchema.index({ technician_id: 1, number: 1 }, { unique: true });
// A job may be settled once. Partial so settlements with no linked jobs (an
// empty array indexes as `undefined`) do not collide with each other.
TechnicianSettlementSchema.index(
  { job_ids: 1 },
  {
    unique: true,
    partialFilterExpression: { job_ids: { $type: "objectId" } },
    name: "unique_settled_job",
  }
);
// Settlements list: newest period first, optionally per technician / status.
TechnicianSettlementSchema.index({ technician_id: 1, period_to: -1 });
TechnicianSettlementSchema.index({ status: 1, period_to: -1 });

module.exports = mongoose.model("TechnicianSettlement", TechnicianSettlementSchema);
