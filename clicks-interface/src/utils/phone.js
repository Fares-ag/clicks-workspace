/** Qatar-first phone helpers — UI shows 8 local digits; storage uses E.164. */

export const DEFAULT_COUNTRY_CODE = "+974";

export const COUNTRY_CODES = [
  { value: "+974", label: "+974" },
  { value: "+971", label: "+971" },
  { value: "+966", label: "+966" },
  { value: "+973", label: "+973" },
  { value: "+968", label: "+968" },
  { value: "+965", label: "+965" },
];

/** Strip country code / non-digits → up to 8 local digits for the input. */
export function toLocalDigits(raw, countryCode = DEFAULT_COUNTRY_CODE) {
  let digits = String(raw ?? "").replace(/\D/g, "");
  const cc = String(countryCode ?? "").replace(/\D/g, "");
  if (cc && digits.startsWith(cc) && digits.length > cc.length) {
    digits = digits.slice(cc.length);
  }
  // Common stored forms: 974XXXXXXXX
  if (digits.length > 8 && digits.startsWith("974")) {
    digits = digits.slice(3);
  }
  return digits.slice(0, 8);
}

/** Combine prefix + 8 local digits → E.164 (+974XXXXXXXX). */
export function toE164(localDigits, countryCode = DEFAULT_COUNTRY_CODE) {
  const local = toLocalDigits(localDigits, countryCode);
  const cc = String(countryCode || DEFAULT_COUNTRY_CODE).startsWith("+")
    ? String(countryCode || DEFAULT_COUNTRY_CODE)
    : `+${countryCode || DEFAULT_COUNTRY_CODE.replace(/^\+/, "")}`;
  return `${cc}${local}`;
}

export function isValidLocalPhone(localDigits) {
  return /^\d{8}$/.test(String(localDigits ?? ""));
}
