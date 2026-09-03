import 'package:flutter/material.dart';

/// Spacing tokens from clicks-interface theme.css
abstract final class AppSpacing {
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 16;
  static const double lg = 24;
  static const double xl = 32;
  static const double xxl = 48;
}

abstract final class AppRadii {
  static const double sm = 4;
  static const double md = 8;
  static const double lg = 12;
  static const double xl = 16;
}

abstract final class AppShadows {
  static const List<BoxShadow> sm = [
    BoxShadow(color: Color(0x0D000000), blurRadius: 2, offset: Offset(0, 1)),
  ];

  static const List<BoxShadow> md = [
    BoxShadow(color: Color(0x1A000000), blurRadius: 6, offset: Offset(0, 4)),
  ];

  static const List<BoxShadow> drawer = [
    BoxShadow(color: Color(0x2E101828), blurRadius: 40, offset: Offset(0, 12)),
  ];

  static const List<BoxShadow> card = [
    BoxShadow(color: Color(0x0A101828), blurRadius: 6, offset: Offset(0, 2)),
  ];
}
