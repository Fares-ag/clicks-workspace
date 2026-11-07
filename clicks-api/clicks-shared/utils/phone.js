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

function digitsOnly(raw) {
  return String(raw || "").replace(/\D/g, "");
}

/** Distinct stored formats a historical row might use for the same number. */
function phoneLookupValues(raw, defaultCountryCode = "974") {
  const e164 = normalizePhoneE164(raw, defaultCountryCode);
  const digits = digitsOnly(raw);
  const last8 = digits.slice(-8);
  return [...new Set([
    String(raw || "").trim(),
    e164,
    digits,
    last8,
    digits ? `+${digits}` : "",
    last8.length === 8 ? `+${defaultCountryCode}${last8}` : "",
  ].filter(Boolean))];
}

async function findCustomerByPhone(Customer, raw, extra = {}, select) {
  const variants = phoneLookupValues(raw);
  const last8 = digitsOnly(raw).slice(-8);
  const or = [{ phone_number: { $in: variants } }];
  if (last8.length === 8) or.push({ search_phone: last8 });
  let query = Customer.findOne({ $or: or, ...extra });
  if (select) query = query.select(select);
  return query;
}

module.exports = {
  normalizePhoneE164,
  digitsOnly,
  phoneLookupValues,
  findCustomerByPhone,
};
