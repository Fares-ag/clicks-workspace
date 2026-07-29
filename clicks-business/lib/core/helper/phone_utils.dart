/// Qatar-first phone helpers — same rules as admin Add Job.
const String defaultCountryCode = '+974';

String toLocalDigits(String raw, [String countryCode = defaultCountryCode]) {
  var digits = raw.replaceAll(RegExp(r'\D'), '');
  final cc = countryCode.replaceAll(RegExp(r'\D'), '');
  if (cc.isNotEmpty && digits.startsWith(cc) && digits.length > cc.length) {
    digits = digits.substring(cc.length);
  }
  if (digits.length > 8 && digits.startsWith('974')) {
    digits = digits.substring(3);
  }
  if (digits.length > 8) digits = digits.substring(0, 8);
  return digits;
}

String toE164(String localDigits, [String countryCode = defaultCountryCode]) {
  final local = toLocalDigits(localDigits, countryCode);
  final cc = countryCode.startsWith('+') ? countryCode : '+$countryCode';
  return '$cc$local';
}

bool isValidLocalPhone(String localDigits) =>
    RegExp(r'^\d{8}$').hasMatch(localDigits);
