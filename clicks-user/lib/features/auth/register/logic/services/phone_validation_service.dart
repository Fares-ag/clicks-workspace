class PhoneValidationService {
  static bool validateSubscriberNumber(String subscriberNumber) {
    // Strip all non-digit characters then accept any number between 5 and 15 digits.
    final digits = subscriberNumber.replaceAll(RegExp(r'[^\d]'), '');
    return digits.length >= 5 && digits.length <= 15;
  }
}
