class PhoneValidationService {
  static bool validateSubscriberNumber(String subscriberNumber) {
    // Remove any spaces or special characters for validation
    subscriberNumber = subscriberNumber.replaceAll(RegExp(r'[^\d]'), '');

    // Check for 8-digit standard numbers (mobile/landline)
    if (subscriberNumber.length == 8) {
      return _validateStandardNumber(subscriberNumber);
    }

    // Check for 7-digit toll-free numbers (800XXXX)
    if (subscriberNumber.length == 7 && subscriberNumber.startsWith('800')) {
      return _validateTollFreeNumber(subscriberNumber);
    }

    // Check for 7-digit premium service numbers (900XXXX)
    if (subscriberNumber.length == 7 && subscriberNumber.startsWith('900')) {
      return _validatePremiumNumber(subscriberNumber);
    }

    return false;
  }

  static bool _validateStandardNumber(String number) {
    String firstDigit = number[0];

    // Mobile numbers: start with 3, 5, 6, or 7
    // Landline numbers: start with 4
    List<String> validFirstDigits = ['3', '4', '5', '6', '7'];

    if (!validFirstDigits.contains(firstDigit)) {
      return false;
    }

    // Additional validation for mobile prefixes (33, 55, 66, 77)
    if (['3', '5', '6', '7'].contains(firstDigit)) {
      // Check if it's a valid mobile prefix or just starts with valid digit
      if (firstDigit == '3' ||
          firstDigit == '5' ||
          firstDigit == '6' ||
          firstDigit == '7') {
        // Accept numbers starting with these digits
        return true;
      }
    }

    // Landline validation (starts with 4)
    if (firstDigit == '4') {
      return true;
    }

    return true; // Valid standard number format
  }

  static bool _validateTollFreeNumber(String number) {
    // Format: 800XXXX (7 digits total)
    if (number.startsWith('800') && number.length == 7) {
      // Check that remaining 4 digits are numeric
      String remainingDigits = number.substring(3);
      return RegExp(r'^\d{4}$').hasMatch(remainingDigits);
    }
    return false;
  }

  static bool _validatePremiumNumber(String number) {
    // Format: 900XXXX (7 digits total)
    if (number.startsWith('900') && number.length == 7) {
      // Check that remaining 4 digits are numeric
      String remainingDigits = number.substring(3);
      return RegExp(r'^\d{4}$').hasMatch(remainingDigits);
    }
    return false;
  }
}
