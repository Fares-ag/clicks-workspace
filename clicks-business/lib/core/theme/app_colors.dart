import 'package:flutter/material.dart';

/// Brand tokens aligned with clicks-business-web / admin interface.
class AppColors {
  static const Color primary = Color(0xFF981F1F);
  static const Color primaryHover = Color(0xFF7A1919);
  static const Color accent = Color(0xFF00796B);
  static const Color pageBackground = Color(0xFFF9FAFB);
  static const Color background = pageBackground;
  static const Color surface = Color(0xFFFFFFFF);
  static const Color border = Color(0xFFE4E7EC);
  static const Color inputBorder = Color(0xFFD0D5DD);
  static const Color textPrimary = Color(0xFF252525);
  static const Color text = textPrimary;
  static const Color muted = Color(0xFF667085);
  static const Color field = Color(0xFFEDF1F3);
  static const Color navHighlight = Color(0xFFFDF2FA);
  static const Color success = Color(0xFF039855);
  static const Color warning = Color(0xFFF79009);
  static const Color info = Color(0xFF1570EF);
  static const Color danger = Color(0xFFD92D20);

  static const LinearGradient earningsGradient = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [Color(0xFF981F1F), Color(0xFF320A0A)],
  );
}
