import 'package:flutter/material.dart';

/// Web admin typography — Helvetica Neue stack from theme.css.
class AdminTypography {
  AdminTypography._();

  static const String fontFamily =
      'Helvetica Neue, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif';

  static const TextStyle body = TextStyle(
    fontFamily: fontFamily,
    fontSize: 14,
    height: 1.5,
    color: Color(0xFF252525),
  );

  static const TextStyle heading = TextStyle(
    fontFamily: fontFamily,
    fontSize: 18,
    height: 1.4,
    fontWeight: FontWeight.w600,
    color: Color(0xFF252525),
  );

  static const TextStyle pageTitle = TextStyle(
    fontFamily: fontFamily,
    fontSize: 24,
    height: 1.3,
    fontWeight: FontWeight.w700,
    color: Color(0xFF252525),
  );

  static const TextStyle caption = TextStyle(
    fontFamily: fontFamily,
    fontSize: 12,
    height: 1.5,
    color: Color(0xFF667085),
  );

  static const TextStyle label = TextStyle(
    fontFamily: fontFamily,
    fontSize: 12,
    fontWeight: FontWeight.w500,
    color: Color(0xFF667085),
  );
}
