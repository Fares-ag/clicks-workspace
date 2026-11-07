const mongoose = require("mongoose");
const {
  CONTACT_US_CATEGORY_CODES,
  CONTACT_US_STATUSES,
} = require("../constants/contactUsCategories");

const ReplySchema = new mongoose.Schema(
  {
    author_type: { type: String, enum: ["admin", "customer"], required: true },
    author_id: { type: mongoose.Schema.Types.ObjectId, default: null },
    author_name: { type: String, default: "", trim: true },
    message: { type: String, required: true, trim: true, maxlength: 4000 },
    created_at: { type: Date, default: Date.now },
  },
  { _id: true }
);

const ContactUsSchema = new mongoose.Schema(
  {
    customer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true
    },
    // Human ticket number shown to the customer and to support ("CU-000042").
    ticket_number: { type: String, default: undefined },
    // Stable code — see clicks-shared/constants/contactUsCategories.js.
    category: {
      type: String,
      enum: CONTACT_US_CATEGORY_CODES,
      default: "other",
    },
    // Free-text label as the customer saw it (kept for legacy rows).
    issue: {
      type: String,
      required: true
    },
    description: {
      type: String,
      required: true
    },
    job_id: { type: mongoose.Schema.Types.ObjectId, ref: "Job", default: null },
    status: {
      type: String,
      enum: CONTACT_US_STATUSES,
      default: "pending"
    },
    assigned_to: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
    replies: { type: [ReplySchema], default: [] },
    last_reply_at: { type: Date, default: null },
    resolved_at: { type: Date, default: null },
  },
  { timestamps: true }
);

ContactUsSchema.index({ ticket_number: 1 }, { unique: true, sparse: true });
ContactUsSchema.index({ customer_id: 1, createdAt: -1 });
ContactUsSchema.index({ status: 1, createdAt: -1 });
ContactUsSchema.index({ category: 1, createdAt: -1 });

// Same counter collection Customer.client_id uses (one doc per sequence).
const Counter =
  mongoose.models.Counter ||
  mongoose.model(
    "Counter",
    new mongoose.Schema(
      { _id: { type: String }, seq: { type: Number, default: 0 } },
      { versionKey: false }
    )
  );

const TICKET_COUNTER_ID = "contact_us_ticket";

async function nextTicketNumber() {
  const counter = await Counter.findByIdAndUpdate(
    TICKET_COUNTER_ID,
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  return `CU-${String(counter.seq).padStart(6, "0")}`;
}

ContactUsSchema.pre("save", async function assignTicketNumber(next) {
  if (this.ticket_number) return next();
  try {
    this.ticket_number = await nextTicketNumber();
    next();
  } catch (err) {
    next(err);
  }
});

ContactUsSchema.statics.nextTicketNumber = nextTicketNumber;

module.exports = mongoose.model("ContactUs", ContactUsSchema);
