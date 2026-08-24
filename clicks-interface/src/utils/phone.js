/** Qatar-first phone helpers — UI shows the local digits; storage uses E.164. */

export const DEFAULT_COUNTRY_CODE = "+974";

export const COUNTRY_CODES = [
  { value: "+974", label: "+974" },
  { value: "+971", label: "+971" },
  { value: "+966", label: "+966" },
  { value: "+973", label: "+973" },
  { value: "+968", label: "+968" },
  { value: "+965", label: "+965" },
];

/** Shortest local number any offered prefix accepts. */
export const MIN_LOCAL_LENGTH = 8;

/** Longest national (local) number per offered prefix. */
export const LOCAL_LENGTHS = {
  "+974": 8,
  "+971": 9,
  "+966": 9,
  "+973": 8,
  "+968": 8,
  "+965": 8,
};

/** Normalize a prefix to "+XXX" form. */
export function normalizeCountryCode(countryCode) {
  const digits = String(countryCode ?? "").replace(/\D/g, "");
  return digits ? `+${digits}` : DEFAULT_COUNTRY_CODE;
}

/** How many local digits the given prefix accepts at most. */
export function localLengthFor(countryCode = DEFAULT_COUNTRY_CODE) {
  return LOCAL_LENGTHS[normalizeCountryCode(countryCode)] || MIN_LOCAL_LENGTH;
}

/** Human hint for the accepted local length, e.g. "8-digit" / "8- or 9-digit". */
export function localLengthHint(countryCode = DEFAULT_COUNTRY_CODE) {
  const max = localLengthFor(countryCode);
  return max > MIN_LOCAL_LENGTH
    ? `${MIN_LOCAL_LENGTH}- or ${max}-digit`
    : `${max}-digit`;
}

/**
 * Pick the prefix a stored E.164 value belongs to (longest match first).
 * Used when hydrating edit forms so a stored +971/+966 number is not parsed
 * as if it were Qatari.
 */
export function countryCodeFromPhone(raw, fallback = DEFAULT_COUNTRY_CODE) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return fallback;
  const match = COUNTRY_CODES.map((c) => c.value)
    .slice()
    .sort((a, b) => b.length - a.length)
    .find((code) => {
      const cc = code.replace(/^\+/, "");
      return digits.startsWith(cc) && digits.length > cc.length;
    });
  return match || fallback;
}

/** Strip country code / non-digits → the local digits for the input. */
export function toLocalDigits(raw, countryCode = DEFAULT_COUNTRY_CODE) {
  let digits = String(raw ?? "").replace(/\D/g, "");
  const code = normalizeCountryCode(countryCode);
  const max = localLengthFor(code);
  const cc = code.replace(/^\+/, "");
  // "00" international prefix, e.g. 0097433123456
  if (digits.length > max && digits.startsWith("00")) {
    digits = digits.slice(2);
  }
  // Country code prefix. Only stripped when the value is longer than a local
  // number, so local digits that merely start with the code (a +971 number
  // beginning 971..., a Qatari 974xxxxx) are left intact.
  if (cc && digits.length > max && digits.startsWith(cc)) {
    digits = digits.slice(cc.length);
  } else if (digits.length > max && digits.startsWith("974")) {
    // Common stored forms: 974XXXXXXXX
    digits = digits.slice(3);
  }
  // National trunk zero, e.g. 0501234567
  if (digits.length > max && digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  return digits.slice(0, max);
}

/** Combine prefix + local digits → E.164 (+974XXXXXXXX). */
export function toE164(localDigits, countryCode = DEFAULT_COUNTRY_CODE) {
  const cc = normalizeCountryCode(countryCode);
  const local = toLocalDigits(localDigits, cc);
  return `${cc}${local}`;
}

export function isValidLocalPhone(localDigits, countryCode = DEFAULT_COUNTRY_CODE) {
  const value = String(localDigits ?? "");
  if (!/^\d+$/.test(value)) return false;
  // Qatar stays exactly 8; the 9-digit countries also accept 8 so records saved
  // by the older 8-digit-only form can still be edited.
  return (
    value.length >= MIN_LOCAL_LENGTH && value.length <= localLengthFor(countryCode)
  );
}
