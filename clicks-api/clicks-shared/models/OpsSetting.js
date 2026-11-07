const mongoose = require("mongoose");

/**
 * Operational key/value settings that admins can change without a deploy.
 *
 * Known keys (see clicks-shared/services/opsSettings.js):
 *   - oncall_phones: string[] of E.164 numbers paged by the SOS escalation
 *     ladder. Overrides env ONCALL_PHONE.
 *   - support_phone: E.164 string shown to customers. Overrides env SUPPORT_PHONE.
 */
const OpsSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true, maxlength: 64 },
    value: { type: mongoose.Schema.Types.Mixed, default: null },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  { timestamps: true }
);

OpsSettingSchema.index({ key: 1 }, { unique: true, name: "uniq_ops_setting_key" });

module.exports = mongoose.model("OpsSetting", OpsSettingSchema);
