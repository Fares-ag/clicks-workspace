/// Qatar-first phone helpers — mirrors clicks-interface/src/utils/phone.js
const String defaultCountryCode = '+974';

const kCountryCodes = ['+974', '+971', '+966', '+973', '+968', '+965'];

const kLocalLengths = {
  '+974': 8,
  '+971': 9,
  '+966': 9,
  '+973': 8,
  '+968': 8,
  '+965': 8,
};

const int minLocalLength = 8;

String normalizeCountryCode(String? countryCode) {
  final digits = (countryCode ?? '').replaceAll(RegExp(r'\D'), '');
  return digits.isEmpty ? defaultCountryCode : '+$digits';
}

int localLengthFor([String countryCode = defaultCountryCode]) {
  return kLocalLengths[normalizeCountryCode(countryCode)] ?? minLocalLength;
}

String localLengthHint([String countryCode = defaultCountryCode]) {
  final max = localLengthFor(countryCode);
  return max > minLocalLength
      ? '$minLocalLength- or $max-digit'
      : '$max-digit';
}

String countryCodeFromPhone(String? raw, [String fallback = defaultCountryCode]) {
  final digits = (raw ?? '').replaceAll(RegExp(r'\D'), '');
  if (digits.isEmpty) return fallback;
  final sorted = kCountryCodes.toList()..sort((a, b) => b.length.compareTo(a.length));
  for (final code in sorted) {
    final cc = code.replaceAll('+', '');
    if (digits.startsWith(cc) && digits.length > cc.length) return code;
  }
  return fallback;
}

String toLocalDigits(String raw, [String countryCode = defaultCountryCode]) {
  var digits = raw.replaceAll(RegExp(r'\D'), '');
  final code = normalizeCountryCode(countryCode);
  final max = localLengthFor(code);
  final cc = code.replaceAll('+', '');
  if (digits.length > max && digits.startsWith('00')) {
    digits = digits.substring(2);
  }
  if (cc.isNotEmpty && digits.length > max && digits.startsWith(cc)) {
    digits = digits.substring(cc.length);
  } else if (digits.length > max && digits.startsWith('974')) {
    digits = digits.substring(3);
  }
  if (digits.length > max) digits = digits.substring(0, max);
  return digits;
}

String toE164(String localDigits, [String countryCode = defaultCountryCode]) {
  final local = toLocalDigits(localDigits, countryCode);
  final cc = normalizeCountryCode(countryCode);
  return '$cc$local';
}

bool isValidLocalPhone(String localDigits, [String countryCode = defaultCountryCode]) {
  final len = localDigits.replaceAll(RegExp(r'\D'), '').length;
  final max = localLengthFor(countryCode);
  return len >= minLocalLength && len <= max;
}
