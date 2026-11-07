/**
 * Ops settings resolver: admin-set OpsSetting rows override env defaults.
 *
 *   oncall_phones  <- OpsSetting "oncall_phones"  || env ONCALL_PHONE (comma-separated E.164)
 *   support_phone  <- OpsSetting "support_phone"  || env SUPPORT_PHONE
 *
 * Reads are cached briefly; the escalation sweeper runs every 30 seconds and
 * every customer session asks for the support number.
 */
const OpsSetting = require("../models/OpsSetting");

const OPS_SETTING_KEYS = ["oncall_phones", "support_phone"];
const E164 = /^\+[1-9]\d{7,14}$/;
const CACHE_MS = 15_000;

let cache = null; // { at, values }

function normalizePhone(raw) {
  if (raw == null) return null;
  const compact = String(raw).replace(/[\s()-]/g, "").trim();
  if (!compact) return null;
  return E164.test(compact) ? compact : null;
}

/** Accepts an array or a comma-separated string; drops anything not E.164. */
function parsePhoneList(raw) {
  const parts = Array.isArray(raw)
    ? raw
    : String(raw == null ? "" : raw).split(",");
  const out = [];
  for (const part of parts) {
    const phone = normalizePhone(part);
    if (phone && !out.includes(phone)) out.push(phone);
  }
  return out;
}

/** Same as parsePhoneList but reports the entries that are not valid E.164. */
function validatePhoneList(raw) {
  const parts = Array.isArray(raw)
    ? raw
    : String(raw == null ? "" : raw).split(",");
  const invalid = [];
  for (const part of parts) {
    const trimmed = String(part == null ? "" : part).trim();
    if (!trimmed) continue;
    if (!normalizePhone(trimmed)) invalid.push(trimmed);
  }
  return { phones: parsePhoneList(raw), invalid };
}

async function loadStoredValues() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.values;
  const rows = await OpsSetting.find({ key: { $in: OPS_SETTING_KEYS } }).lean();
  const values = {};
  for (const row of rows) values[row.key] = row;
  cache = { at: Date.now(), values };
  return values;
}

function clearOpsSettingsCache() {
  cache = null;
}

/**
 * Effective settings with their source, for the admin screen and for callers.
 * @returns {Promise<{ oncall_phones: {value: string[], source: string},
 *                     support_phone: {value: string|null, source: string} }>}
 */
async function getEffectiveOpsSettings() {
  let stored = {};
  try {
    stored = await loadStoredValues();
  } catch (err) {
    console.error("[ops-settings] read failed, using env:", err.message);
  }

  const storedOncall = stored.oncall_phones
    ? parsePhoneList(stored.oncall_phones.value)
    : [];
  const envOncall = parsePhoneList(process.env.ONCALL_PHONE || "");
  const oncall = storedOncall.length
    ? { value: storedOncall, source: "admin" }
    : envOncall.length
      ? { value: envOncall, source: "env" }
      : { value: [], source: "none" };

  const storedSupport = stored.support_phone
    ? normalizePhone(stored.support_phone.value)
    : null;
  const envSupport = normalizePhone(process.env.SUPPORT_PHONE || "");
  const support = storedSupport
    ? { value: storedSupport, source: "admin" }
    : envSupport
      ? { value: envSupport, source: "env" }
      : { value: null, source: "none" };

  return {
    oncall_phones: {
      ...oncall,
      updated_at: stored.oncall_phones?.updatedAt || null,
      updated_by: stored.oncall_phones?.updatedBy || null,
    },
    support_phone: {
      ...support,
      updated_at: stored.support_phone?.updatedAt || null,
      updated_by: stored.support_phone?.updatedBy || null,
    },
  };
}

async function getOncallPhones() {
  return (await getEffectiveOpsSettings()).oncall_phones.value;
}

async function getSupportPhone() {
  return (await getEffectiveOpsSettings()).support_phone.value;
}

module.exports = {
  OPS_SETTING_KEYS,
  normalizePhone,
  parsePhoneList,
  validatePhoneList,
  getEffectiveOpsSettings,
  getOncallPhones,
  getSupportPhone,
  clearOpsSettingsCache,
};
