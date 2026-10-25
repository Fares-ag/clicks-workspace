const ARABIC_INDIC = {
  "٠": "0",
  "١": "1",
  "٢": "2",
  "٣": "3",
  "٤": "4",
  "٥": "5",
  "٦": "6",
  "٧": "7",
  "٨": "8",
  "٩": "9",
  "۰": "0",
  "۱": "1",
  "۲": "2",
  "۳": "3",
  "۴": "4",
  "۵": "5",
  "۶": "6",
  "۷": "7",
  "۸": "8",
  "۹": "9",
};

function normalizePlate(plate) {
  const rawPlate = String(plate || "").trim();
  const canonicalPlate = rawPlate
    .replace(/[٠-٩۰-۹]/g, (ch) => ARABIC_INDIC[ch] || ch)
    .replace(/[\s\-_.]/g, "")
    .toUpperCase();
  return {
    canonicalPlate,
    rawPlate,
    isEmpty: !canonicalPlate,
  };
}

module.exports = {
  normalizePlate,
};
