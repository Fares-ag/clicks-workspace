const mongoose = require("mongoose");

const CustomerSchema = new mongoose.Schema(
  {
    client_id: { type: String, unique: true, sparse: true },
    phone_number: { type: String, required: true, unique: true },
    first_name: { type: String, required: true, minlength: 2, maxlength: 50 },
    last_name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true, minlength: 8, select: false },
    status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
    fcm_token: { type: String },
    deletion_request: {
      reason: { type: String },
      other_reason: { type: String },
      requested_at: { type: Date }
    }
  },
  { timestamps: true }
);

// Atomic sequence for client_id. A sorted scan of existing ids cannot survive
// concurrent signups (two readers pick the same next number) and breaks once
// the sequence grows past 3 digits, so the number comes from a counter doc.
const CLIENT_ID_COUNTER_ID = 'customer_client_id';

const CounterSchema = new mongoose.Schema(
  {
    _id: { type: String },
    seq: { type: Number, default: 0 }
  },
  { versionKey: false }
);

const Counter =
  mongoose.models.Counter || mongoose.model('Counter', CounterSchema);

// One-time seed: start the counter at the highest existing OC-<n> so already
// issued ids are never re-used. No-op once the counter document exists.
async function seedClientIdCounter(CustomerModel) {
  const existing = await Counter.findById(CLIENT_ID_COUNTER_ID).lean();
  if (existing) return;

  const previous = await CustomerModel.find(
    { client_id: { $regex: /^OC-\d+$/ } },
    { client_id: 1 }
  ).lean();

  let highest = 0;
  for (const row of previous) {
    const n = parseInt(String(row.client_id).slice(3), 10);
    if (Number.isFinite(n) && n > highest) highest = n;
  }

  try {
    await Counter.create({ _id: CLIENT_ID_COUNTER_ID, seq: highest });
  } catch (error) {
    // Another process seeded it first — its value is equally valid.
    if (error?.code !== 11000) throw error;
  }
}

// Pre-save hook to generate client_id
CustomerSchema.pre('save', async function(next) {
  if (!this.client_id && this.isNew) {
    try {
      await seedClientIdCounter(this.constructor);

      const counter = await Counter.findByIdAndUpdate(
        CLIENT_ID_COUNTER_ID,
        { $inc: { seq: 1 } },
        { upsert: true, new: true }
      );

      // Format as OC-XXX (padded to at least 3 digits, unbounded above 999)
      this.client_id = `OC-${String(counter.seq).padStart(3, '0')}`;
    } catch (error) {
      return next(error);
    }
  }
  next();
});

module.exports = mongoose.model("Customer", CustomerSchema);
