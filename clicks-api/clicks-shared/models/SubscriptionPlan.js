const mongoose = require("mongoose");

const IncludedSchema = new mongoose.Schema(
  {
    serviceTypes: { type: [String], default: [] },
    quota: { type: Number, required: true, min: 0 },
    bucket: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const IntervalSchema = new mongoose.Schema(
  {
    interval: { type: String, enum: ["month", "year"], required: true },
    durationMonths: { type: Number, required: true, min: 1 },
    priceQar: { type: Number, required: true, min: 0 },
    included: { type: [IncludedSchema], default: [] },
  },
  { _id: false }
);

const SubscriptionPlanSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, lowercase: true },
    name_en: { type: String, required: true, trim: true },
    name_ar: { type: String, default: "", trim: true },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    eligibleServiceTypes: { type: [String], default: [] },
    intervals: { type: [IntervalSchema], default: [] },
    active: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SubscriptionPlan", SubscriptionPlanSchema);
