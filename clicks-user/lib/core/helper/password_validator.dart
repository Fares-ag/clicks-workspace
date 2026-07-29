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

  static String? validate(String? value) {
    if (value == null || value.isEmpty) {
      return 'Password is required';
    }

    if (!hasMinLength(value)) {
      return 'Password must be at least 8 characters';
    }
    if (!hasUppercase(value)) {
      return 'Password must contain at least one uppercase letter';
    }
    if (!hasLowercase(value)) {
      return 'Password must contain at least one lowercase letter';
    }
    if (!hasNumber(value)) {
      return 'Password must contain at least one number';
    }
    if (!hasSpecialChar(value)) {
      return 'Password must contain at least one special character (!@#\$%^&*)';
    }

    return null;
  }
}
