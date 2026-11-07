/**
 * Ops settings (full admin): on-call phones for SOS escalation and the
 * customer support number. Admin values override env ONCALL_PHONE /
 * SUPPORT_PHONE; clearing a value falls back to env.
 */
const OpsSetting = require("../../../clicks-shared/models/OpsSetting");
const {
  getEffectiveOpsSettings,
  validatePhoneList,
  normalizePhone,
  clearOpsSettingsCache,
} = require("../../../clicks-shared/services/opsSettings");
const { recordAudit } = require("../utils/auditLog");

function envDefaults() {
  return {
    oncall_phones: validatePhoneList(process.env.ONCALL_PHONE || "").phones,
    support_phone: normalizePhone(process.env.SUPPORT_PHONE || ""),
  };
}

async function getOpsSettings(_req, res) {
  try {
    const effective = await getEffectiveOpsSettings();
    res.json({ settings: effective, env_defaults: envDefaults() });
  } catch (err) {
    res.status(500).json({ message: "Failed to load ops settings", error: err.message });
  }
}

/**
 * PUT /api/ops-settings
 * body: { oncall_phones?: string[] | "csv" | null, support_phone?: string | null }
 * null / "" / [] clears the admin value (falls back to env).
 */
async function updateOpsSettings(req, res) {
  try {
    const body = req.body || {};
    const writes = [];

    if (Object.prototype.hasOwnProperty.call(body, "oncall_phones")) {
      const raw = body.oncall_phones;
      const { phones, invalid } = validatePhoneList(raw == null ? "" : raw);
      if (invalid.length) {
        return res.status(400).json({
          message: `Not valid E.164 numbers: ${invalid.join(", ")}`,
          code: "INVALID_PHONE",
        });
      }
      if (phones.length > 10) {
        return res.status(400).json({
          message: "At most 10 on-call numbers",
          code: "TOO_MANY_PHONES",
        });
      }
      writes.push({ key: "oncall_phones", value: phones.length ? phones : null });
    }

    if (Object.prototype.hasOwnProperty.call(body, "support_phone")) {
      const raw = body.support_phone;
      const blank = raw == null || String(raw).trim() === "";
      const phone = blank ? null : normalizePhone(raw);
      if (!blank && !phone) {
        return res.status(400).json({
          message: `Not a valid E.164 number: ${raw}`,
          code: "INVALID_PHONE",
        });
      }
      writes.push({ key: "support_phone", value: phone });
    }

    if (!writes.length) {
      return res.status(400).json({
        message: "Nothing to update (oncall_phones, support_phone)",
        code: "NO_CHANGES",
      });
    }

    const adminId = req.user?.id || req.user?._id || null;
    for (const { key, value } of writes) {
      const before = await OpsSetting.findOne({ key }).lean();
      let row;
      if (value == null) {
        row = before;
        if (before) await OpsSetting.deleteOne({ _id: before._id });
      } else {
        row = await OpsSetting.findOneAndUpdate(
          { key },
          { $set: { value, updatedBy: adminId } },
          { new: true, upsert: true, setDefaultsOnInsert: true }
        );
      }
      if (row) {
        await recordAudit({
          req,
          action: "ops_settings.update",
          entityType: "ops_setting",
          entityId: row._id,
          changes: {
            key,
            value: { from: before ? before.value : null, to: value },
          },
        });
      }
    }
    clearOpsSettingsCache();

    const effective = await getEffectiveOpsSettings();
    res.json({ message: "Ops settings updated", settings: effective, env_defaults: envDefaults() });
  } catch (err) {
    res.status(500).json({ message: "Failed to update ops settings", error: err.message });
  }
}

module.exports = { getOpsSettings, updateOpsSettings };
