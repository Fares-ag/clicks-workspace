const mongoose = require("mongoose");

const AdminAuditLogSchema = new mongoose.Schema({
  admin_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Admin",
    required: true,
    index: true,
  },
  admin_role: { type: String, default: "" },
  action: { type: String, required: true, index: true },
  entity_type: { type: String, required: true },
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true,
  },
  changes: { type: mongoose.Schema.Types.Mixed, default: null },
  ip: { type: String, default: "" },
  at: { type: Date, default: Date.now, index: true },
});

AdminAuditLogSchema.index({ entity_id: 1, at: -1 });
AdminAuditLogSchema.index({ admin_id: 1, at: -1 });
AdminAuditLogSchema.index({ at: -1 });

module.exports = mongoose.model("AdminAuditLog", AdminAuditLogSchema);
