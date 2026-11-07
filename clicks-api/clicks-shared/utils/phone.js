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

/**
 * True when the input can only be a number in the default country: 8 local
 * digits, or a number that already carries the country code (974 / +974).
 *
 * The last-8-digit fallback is ONLY safe for these. Applying it to any input
 * let "+44 5551 2345" match the Qatar account "+974 5551 2345" — the foreign
 * number then received the reset code and took the account over (scenario 6).
 */
function isDefaultCountryNumber(raw, defaultCountryCode = "974") {
  const cleaned = String(raw || "").trim().replace(/[\s-]/g, "");
  const digits = digitsOnly(cleaned);
  if (/^\d{8}$/.test(digits) && !cleaned.startsWith("+")) return true;
  if (cleaned.startsWith(`+${defaultCountryCode}`)) return true;
  if (cleaned.startsWith(`00${defaultCountryCode}`)) return true;
  return (
    digits.startsWith(defaultCountryCode) &&
    digits.length === defaultCountryCode.length + 8
  );
}

/** Distinct stored formats a historical row might use for the same number. */
function phoneLookupValues(raw, defaultCountryCode = "974") {
  const e164 = normalizePhoneE164(raw, defaultCountryCode);
  const digits = digitsOnly(raw);
  const values = [String(raw || "").trim(), e164, digits, digits ? `+${digits}` : ""];
  if (isDefaultCountryNumber(raw, defaultCountryCode)) {
    const last8 = digits.slice(-8);
    if (last8.length === 8) {
      values.push(last8, `${defaultCountryCode}${last8}`, `+${defaultCountryCode}${last8}`);
    }
  }
  return [...new Set(values.filter(Boolean))];
}

/**
 * Find a customer by phone.
 *
 * The exact E.164 match wins. Only when there is none do we fall back to the
 * legacy stored formats ("55512345", "97455512345"), and the suffix forms are
 * only generated for numbers that are unambiguously in the default country.
 * Legacy duplicate rows are merged by scripts/dedupe-customer-phones.js; until
 * that runs, preferring the exact row keeps the result deterministic instead
 * of "whichever row Mongo returns first" (scenario 7).
 */
async function findCustomerByPhone(Customer, raw, extra = {}, select) {
  const e164 = normalizePhoneE164(raw);
  if (!e164) return null;

  const run = (filter) => {
    let query = Customer.findOne({ ...filter, ...extra }).sort({ createdAt: 1 });
    if (select) query = query.select(select);
    return query;
  };

  const exact = await run({ phone_number: e164 });
  if (exact) return exact;

  const variants = phoneLookupValues(raw);
  const or = [{ phone_number: { $in: variants } }];
  if (isDefaultCountryNumber(raw)) {
    const last8 = digitsOnly(raw).slice(-8);
    if (last8.length === 8) or.push({ search_phone: { $in: [last8, `974${last8}`] } });
  }
  return run({ $or: or });
}

/**
 * OTP sends are restricted to these prefixes (env OTP_ALLOWED_PREFIXES,
 * comma-separated, default "+974"). Blocks SMS pumping to premium
 * international ranges at launch (scenario 11).
 */
function otpAllowedPrefixes() {
  const raw = process.env.OTP_ALLOWED_PREFIXES;
  const list = String(raw == null || raw === "" ? "+974" : raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.startsWith("+") ? s : `+${s}`));
  return list.length ? list : ["+974"];
}

function isOtpAllowedPhone(raw) {
  const e164 = normalizePhoneE164(raw);
  if (!/^\+\d{8,15}$/.test(e164)) return false;
  return otpAllowedPrefixes().some((p) => p === "+" || e164.startsWith(p));
}

module.exports = {
  normalizePhoneE164,
  digitsOnly,
  isDefaultCountryNumber,
  phoneLookupValues,
  findCustomerByPhone,
  otpAllowedPrefixes,
  isOtpAllowedPhone,
};
