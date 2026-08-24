const mongoose = require("mongoose");

// Accrual-eligible job types: lockout / tire catalog values plus legacy strings.
const ELIGIBLE_JOB_TYPES = [
  "Lock Out",
  "Flat Tire",
  "Tire Change",
  "Lockout",
  "Flat tire",
  "keyless_car_opening",
  "tire_change",
];

const PartnerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    phone: { type: String, default: "" },
    email: { type: String, default: "", lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    isActive: { type: Boolean, default: true },
    investmentAmount: { type: Number, required: true, min: 0, default: 10000 },
    profitPerPeriod: { type: Number, required: true, min: 0, default: 4000 },
    /**
     * Admin-controlled accrual ceiling for the current period (QAR).
     * Defaults from the ladder formula; admin can override anytime.
     */
    currentPeriodCap: { type: Number, min: 0, default: null },
    periodMonths: { type: Number, required: true, min: 1, default: 2 },
    currentPeriod: { type: Number, required: true, min: 1, default: 1 },
    periodStartedAt: { type: Date, default: Date.now },
    periodEndsAt: { type: Date, required: true },
    status: {
      type: String,
      enum: ["active", "capped", "frozen", "inactive"],
      default: "active",
    },
    /** Lifetime QAR credited from attributed completed jobs */
    accruedTotal: { type: Number, default: 0, min: 0 },
    /** Lifetime QAR of principal already settled through paid withdrawals */
    withdrawnInvestment: { type: Number, default: 0, min: 0 },
    /** Lifetime QAR of earnings already settled through paid withdrawals */
    withdrawnEarnings: { type: Number, default: 0, min: 0 },
    /** FCM device token for accrual push notifications */
    fcm_token: { type: String, default: null },
  },
  { timestamps: true }
);

PartnerSchema.index({ name: 1 });
PartnerSchema.index({ email: 1 });
PartnerSchema.index({ status: 1, isActive: 1 });

/** Default ladder: investment + n × profitPerPeriod */
PartnerSchema.methods.formulaPeriodCap = function formulaPeriodCap() {
  return (
    Number(this.investmentAmount || 0) +
    Number(this.currentPeriod || 1) * Number(this.profitPerPeriod || 0)
  );
};

PartnerSchema.methods.periodCap = function periodCap() {
  if (this.currentPeriodCap != null && this.currentPeriodCap !== "") {
    return Number(this.currentPeriodCap);
  }
  return this.formulaPeriodCap();
};

PartnerSchema.methods.remainingToCap = function remainingToCap() {
  return Math.max(0, this.periodCap() - Number(this.accruedTotal || 0));
};

PartnerSchema.methods.daysLeft = function daysLeft() {
  if (!this.periodEndsAt) return 0;
  const ms = new Date(this.periodEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
};

PartnerSchema.statics.eligibleJobTypes = function eligibleJobTypes() {
  return ELIGIBLE_JOB_TYPES;
};

PartnerSchema.statics.computePeriodEnd = function computePeriodEnd(
  start,
  periodMonths = 2
) {
  const d = new Date(start || Date.now());
  d.setMonth(d.getMonth() + Number(periodMonths || 2));
  return d;
};

PartnerSchema.methods.toPublicJSON = function toPublicJSON() {
  const o = this.toObject({ virtuals: false });
  delete o.password;
  delete o.fcm_token;
  const cap = this.periodCap();
  const status = this.status || "active";
  const statusCopy = {
    active:
      "Accruing from attributed completed jobs until the period maximum.",
    capped:
      "Period maximum reached. Accrual paused until the next period starts.",
    frozen:
      "Period ended under the maximum. Accrual paused until the next period starts.",
    inactive: "This partner account is inactive.",
  };
  return {
    ...o,
    currentPeriodCap: cap,
    periodCap: cap,
    formulaPeriodCap: this.formulaPeriodCap(),
    remainingToCap: Math.max(0, cap - Number(this.accruedTotal || 0)),
    daysLeft: this.daysLeft(),
    statusMessage: statusCopy[status] || statusCopy.active,
  };
};

module.exports = mongoose.model("Partner", PartnerSchema);
module.exports.ELIGIBLE_JOB_TYPES = ELIGIBLE_JOB_TYPES;
