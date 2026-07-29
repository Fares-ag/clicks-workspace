import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import 'colors_manager.dart';
import 'font_weight_helper.dart';

const String _fontFamily = 'HelveticaNeue';

/// A class that provides predefined text styles for the application.
class TextStyles {
  /// A regular text style with a font size of 14.
  static TextStyle get font14Regular => TextStyle(
    fontFamily: _fontFamily,
    fontSize: 14.sp,
    fontWeight: FontWeightHelper.regular,
  );

  static TextStyle get font14Medium => TextStyle(
    fontFamily: _fontFamily,
    fontSize: 14.sp,
    fontWeight: FontWeightHelper.medium,
  );

  /// A regular grey text style with a font size of 14.
  static TextStyle get font14RegularGrey => TextStyle(
    fontFamily: _fontFamily,
    fontSize: 14.sp,
    fontWeight: FontWeight.w400,
    color: Colors.grey,
  );

  static TextStyle get font14MediumGrey => TextStyle(
    fontFamily: _fontFamily,
    fontSize: 14.sp,
    fontWeight: FontWeightHelper.medium,
    color: Colors.grey,
  );

  /// A regular black text style with a font size of 16.
  static TextStyle get font16RegularBlack => TextStyle(
    fontFamily: _fontFamily,
    fontSize: 16.sp,
    fontWeight: FontWeight.w400,
  );

  /// A regular black text style with a font size of 12.
  static TextStyle get font12RegularBlack => TextStyle(
    fontFamily: _fontFamily,
    fontSize: 12.sp,
    fontWeight: FontWeight.w400,
  );

  static TextStyle get font12SemiBoldMainColor => TextStyle(
    fontFamily: _fontFamily,
    fontSize: 12.sp,
    fontWeight: FontWeightHelper.semiBold,
    color: ColorsManager.mainColor,
  );

  /// A medium text style with a font size of 24.
  static TextStyle get font24Medium => TextStyle(
    fontFamily: _fontFamily,
    fontSize: 24.sp,
    fontWeight: FontWeight.w500,
  );

  /// A regular grey text style with a font size of 12.
  static TextStyle get font12RegularGrey => TextStyle(
    fontFamily: _fontFamily,
    fontSize: 12.sp,
    fontWeight: FontWeight.w400,
    color: Colors.grey,
  );

  static TextStyle get font28Bold => TextStyle(
    fontFamily: _fontFamily,
    fontSize: 28,
    fontWeight: FontWeightHelper.bold,
  );

  static TextStyle get font10Regular => TextStyle(
    fontFamily: _fontFamily,
    fontSize: 10,
    fontWeight: FontWeightHelper.regular,
  );

  /// A medium text style for app buttons with a font size of 16.
  static TextStyle get fontAppButton => TextStyle(
    fontFamily: _fontFamily,
    fontSize: 16.sp,
    fontWeight: FontWeight.w500,
  );

  // Additional styles matching Figma specs
  static TextStyle get font20Bold => TextStyle(
    fontFamily: _fontFamily,
    fontSize: 20.sp,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.2,
    height: 30 / 20,
    color: const Color(0xFF252525),
  );

  static TextStyle get font13Regular => TextStyle(
    fontFamily: _fontFamily,
    fontSize: 13.sp,
    fontWeight: FontWeight.w400,
    letterSpacing: -0.13,
    color: const Color(0xFF494949),
  );

  static TextStyle get font16Medium => TextStyle(
    fontFamily: _fontFamily,
    fontSize: 16.sp,
    fontWeight: FontWeight.w500,
  );

  static TextStyle get font18Bold => TextStyle(
    fontFamily: _fontFamily,
    fontSize: 18.sp,
    fontWeight: FontWeight.w700,
    color: const Color(0xFF252525),
  );
}
