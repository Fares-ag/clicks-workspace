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
    password: { type: String, required: true },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Admin", AdminSchema);
