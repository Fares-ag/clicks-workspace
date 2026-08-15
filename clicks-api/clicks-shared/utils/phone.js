/**
 * Normalize phone to E.164 (Qatar 8-digit local → +974XXXXXXXX).
 */
function normalizePhoneE164(raw, defaultCountryCode = "974") {
  const cleaned = String(raw || "").trim().replace(/[\s-]/g, "");
  const digits = cleaned.replace(/\D/g, "");
  if (/^\d{8}$/.test(digits)) return `+${defaultCountryCode}${digits}`;
  if (cleaned.startsWith("+")) return cleaned;
  if (/^\d+$/.test(cleaned)) return `+${cleaned}`;
  return cleaned;
}

module.exports = { normalizePhoneE164 };
