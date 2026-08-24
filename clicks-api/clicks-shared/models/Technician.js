const mongoose = require("mongoose");
const { TECHNICIAN_EXPERTISE } = require("../constants/jobTypes");

const TechnicianPerformanceSchema = new mongoose.Schema(
  {
    totalEarnings: { type: Number, default: 0 },
    completedJobs: { type: Number, default: 0 },
    cancelledJobs: { type: Number, default: 0 },
    openedJobs: { type: Number, default: 0 },
    rejectedJobs: { type: Number, default: 0 },
    cashBalance: { type: Number, default: 0 },
    weeklyOnlineHours: { type: Number, default: 0 },
    earningsData: [
      {
        date: { type: Date },
        amount: { type: Number }
      }
    ]
  },
  { _id: false }
);

const TechnicianSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true },
    profilePicture: { type: String },
    homeHeroUrl: { type: String, default: "" },
    password: { type: String, required: true, select: false },
    workPermitFront: { type: String, select: false },
    workPermitBack: { type: String, select: false },
    workPermitExpiration: { type: Date },
    drivingLicenseFront: { type: String, select: false },
    drivingLicenseBack: { type: String, select: false },
    drivingLicenseExpiration: { type: Date },
    assignedVehicle: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle" },
    expertise: {
      type: [String],
      enum: TECHNICIAN_EXPERTISE,
      default: []
    },
    performance: { type: TechnicianPerformanceSchema },
    applicationStatus: {
      type: String,
      enum: ["Approved", "Rejected", "Pending"],
      default: "Pending"
    },
    rejectionReason: {
      type: String,
      default: null
    },
    currentStatus: {
      type: String,
      enum: ["Online", "Offline", "On Job"],
      default: "Offline"
    },
    /** When current Online/On Job session started (for hours accrual). */
    onlineSessionStartedAt: {
      type: Date,
      default: null,
    },
    currentLocation: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point"
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: [0, 0]
      }
    },
    isActive: {
      type: Boolean,
      default: true
    },
    lastLocationAt: {
      type: Date,
      default: null,
    },
    /**
     * Set when the server INFERRED Offline (socket gone / heartbeat stale)
     * rather than the technician choosing it. A reconnect restores them to
     * Online and clears this; an explicit toggle clears it without restoring.
     * Durable on purpose — in-process timers do not survive a redeploy.
     */
    autoOfflineAt: {
      type: Date,
      default: null,
    },
    /** FCM device token for urgent job push (Android). Cleared on logout. */
    fcm_token: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// Create geospatial index for location-based queries
TechnicianSchema.index({ currentLocation: "2dsphere" });
// Live Map filter: { isActive, currentStatus }. Polled every 8s per admin tab,
// and previously a full collection scan.
TechnicianSchema.index({ isActive: 1, currentStatus: 1 });

module.exports = mongoose.model("Technician", TechnicianSchema);
