import 'package:intl/intl.dart';

import '../components/app_text_field.dart';

/// A helper class for validating various types of input.
class ValidationHelper {
  /// Validates if the given [email] is in a valid email format.
  ///
  /// \param email The email string to validate.
  /// \return `true` if the email is valid, `false` otherwise.
  static bool isEmail(String email) {
    return RegExp(
      r'^[a-zA-Z0-9]+([._-][a-zA-Z0-9]+)*@[a-zA-Z0-9]+([.-][a-zA-Z0-9]+)*\.[a-zA-Z]{2,}$',
    ).hasMatch(email);
  }

  /// Validates if the given [phone] is in a valid phone number format.
  ///
  /// \param phone The phone number string to validate.
  /// \return `true` if the phone number is valid, `false` otherwise.
  // static bool isPhoneNumber(String phone,String code,int length) {
  //   // if eg must start with 10 , 11 , 12  or 15 if saudi arabia must start with 5 and length  must be length
  //  if(code == "+966"){
  //    return RegExp(r"^(05)[0-9]{}$").hasMatch(phone);
  //  }else if(code == "+20"){
  //    return RegExp(r"^(01)[0-9]{9}$").hasMatch(phone);
  //   }else {
  //    return
  //  }
  // }

  /// Validates if the given [password] is in a valid password format.
  ///
  /// \param password The password string to validate.
  /// \return `true` if the password is valid, `false` otherwise.
  static bool isPassword(String password) {
    return RegExp(
      r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])[a-zA-Z\d!@#$%^&*]{8,}$",
    ).hasMatch(password);
  }

  /// Validates if the given [name] is in a valid name format.
  ///
  /// \param name The name string to validate.
  /// \return `true` if the name is valid, `false` otherwise.
  static bool isName(String name) {
    // only arabic and english letters and spaces and length > 3
    return RegExp(r"^[a-zA-Z\u0600-\u06FF\s]{3,}$").hasMatch(name);
  }

  /// Validates if the given [number] is in a valid number format.
  ///
  /// \param number The number string to validate.
  /// \return `true` if the number is valid, `false` otherwise.
  static bool isNumber(String number) {
    return RegExp(r"^[0-9/]{1,}$").hasMatch(number);
  }

  /// Validates if the given [date] is in a valid date format according to the specified [format].
  ///
  /// \param date The date string to validate.
  /// \param format The date format to validate against.
  /// \return `true` if the date is valid, `false` otherwise.
  static bool isDate(String date, String format) {
    return DateFormat(format).tryParse(date) != null;
  }

  /// Function to validate card number using Luhn Algorithm
  static bool isValidCardNumber(String cardNumber) {
    // Remove all non-digit characters
    cardNumber = cardNumber.replaceAll(RegExp(r'[^0-9]'), '');

    // Check if the card number is all the same digit (e.g., 1111111111111111)
    if (RegExp(r'^(\d)\1*$').hasMatch(cardNumber)) {
      return false;
    }

    // Luhn Algorithm
    int sum = 0;
    bool alternate = false;
    for (int i = cardNumber.length - 1; i >= 0; i--) {
      int digit = int.parse(cardNumber[i]);
      if (alternate) {
        digit *= 2;
        if (digit > 9) {
          digit = (digit ~/ 10) + (digit % 10);
        }
      }
      sum += digit;
      alternate = !alternate;
    }
    return sum % 10 == 0;
  }

  static String? isValidCardName(String? cardName) {
    /// Check for empty value
    if (cardName == null || cardName.isEmpty) {
      return "Name is required";
    }

    /// Check for uppercase
    if (cardName != cardName.toUpperCase()) {
      return "Name must be in uppercase";
    }

    /// Check minimum and maximum length
    if (cardName.length < 3 || cardName.length > 50) {
      return "Name must be between 3 and 50 characters";
    }

    /// Check for consecutive spaces, hyphens, or apostrophes
    final consecutiveSpecialCharsRegex = RegExp(r"[\s'-]{2,}");
    if (consecutiveSpecialCharsRegex.hasMatch(cardName)) {
      return "Name cannot contain consecutive special characters";
    }

    /// Check for valid characters (alphabetic, spaces, hyphens, apostrophes)
    final validCharactersRegex = RegExp(r"^[A-Za-z\s'-]+$");
    if (!validCharactersRegex.hasMatch(cardName)) {
      return "Name can only contain letters, spaces, apostrophes, and hyphens";
    }

    return null;
  }

  /// Validates the given [value] based on the specified [type].
  ///
  /// \param value The value to validate.
  /// \param type The type of the value to validate.
  /// \return `true` if the value is valid, `false` otherwise.
  static bool validate(String value, AppTextFieldType type, {String? code}) {
    switch (type) {
      case AppTextFieldType.email:
        return isEmail(value);
      case AppTextFieldType.password:
        return isPassword(value);
      case AppTextFieldType.phone:
        return true;
      case AppTextFieldType.name:
        return isName(value);
      case AppTextFieldType.number:
        return isNumber(value);
      // case AppTextFieldType.date:
      //   return isDate(value,"dd/MM/yyyy");
      default:
        return true;
    }
  }
}
