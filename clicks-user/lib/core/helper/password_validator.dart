import 'package:easy_localization/easy_localization.dart';

class PasswordValidator {
  static bool hasMinLength(String password) => password.length >= 8;
  static bool hasUppercase(String password) =>
      password.contains(RegExp(r'[A-Z]'));
  static bool hasLowercase(String password) =>
      password.contains(RegExp(r'[a-z]'));
  static bool hasNumber(String password) => password.contains(RegExp(r'[0-9]'));
  static bool hasSpecialChar(String password) =>
      password.contains(RegExp(r'[!@#$%^&*]'));

  static bool isValid(String password) {
    return hasMinLength(password) &&
        hasUppercase(password) &&
        hasLowercase(password) &&
        hasNumber(password) &&
        hasSpecialChar(password);
  }

  /// Translated message (en/ar) for the first rule [value] breaks, or null.
  static String? validate(String? value) {
    if (value == null || value.isEmpty) {
      return 'errors.password_required'.tr();
    }

    if (!hasMinLength(value)) {
      return 'errors.password_min_length'.tr();
    }
    if (!hasUppercase(value)) {
      return 'errors.password_uppercase'.tr();
    }
    if (!hasLowercase(value)) {
      return 'errors.password_lowercase'.tr();
    }
    if (!hasNumber(value)) {
      return 'errors.password_number'.tr();
    }
    if (!hasSpecialChar(value)) {
      return 'errors.password_special'.tr();
    }

    return null;
  }
}
