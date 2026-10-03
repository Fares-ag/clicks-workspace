const mongoose = require("mongoose");

const AdminSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    role: {
      type: String,
      required: true,
      enum: [
        "Admin",
        "Super Admin",
        "Job Dispatcher",
        "Coordinator",
        "Call Center Agent"
      ]
    },
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true },
    profilePicture: { type: String },
    password: { type: String, required: true, select: false },
    isActive: { type: Boolean, default: true },
    /** Increment to invalidate all outstanding JWTs for this admin. */
    authTokenVersion: { type: Number, default: 0 },
    fcm_token: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Admin", AdminSchema);
