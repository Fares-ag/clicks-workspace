import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import 'colors_manager.dart';
import 'font_weight_helper.dart';

/// Predefined text styles. Poppins is bundled (see pubspec) so the first
/// launch does not download it.
class TextStyles {
  static const String _family = 'Poppins';

  static TextStyle _style({
    required double fontSize,
    required FontWeight fontWeight,
    Color? color,
  }) {
    return TextStyle(
      fontFamily: _family,
      fontSize: fontSize,
      fontWeight: fontWeight,
      color: color,
    );
  }

  static TextStyle get font14Regular => _style(
    fontSize: 14.sp,
    fontWeight: FontWeightHelper.regular,
  );

  static TextStyle get font14Medium => _style(
    fontSize: 14.sp,
    fontWeight: FontWeightHelper.medium,
  );

  static TextStyle get font14RegularGrey => _style(
    fontSize: 14.sp,
    fontWeight: FontWeight.w400,
    color: Colors.grey,
  );

  static TextStyle get font14MediumGrey => _style(
    fontSize: 14.sp,
    fontWeight: FontWeightHelper.medium,
    color: Colors.grey,
  );

  static TextStyle get font16RegularBlack => _style(
    fontSize: 16.sp,
    fontWeight: FontWeight.w400,
  );

  static TextStyle get font12RegularBlack => _style(
    fontSize: 12.sp,
    fontWeight: FontWeight.w400,
  );

  static TextStyle get font12SemiBoldMainColor => _style(
    fontSize: 12.sp,
    fontWeight: FontWeightHelper.semiBold,
    color: ColorsManager.mainColor,
  );

  static TextStyle get font24Medium => _style(
    fontSize: 24.sp,
    fontWeight: FontWeight.w500,
  );

  static TextStyle get font12RegularGrey => _style(
    fontSize: 12.sp,
    fontWeight: FontWeight.w400,
    color: Colors.grey,
  );

  static TextStyle get font28Bold => _style(
    fontSize: 28,
    fontWeight: FontWeightHelper.bold,
  );

  static TextStyle get font10Regular => _style(
    fontSize: 10,
    fontWeight: FontWeightHelper.regular,
  );

  static TextStyle get fontAppButton => _style(
    fontSize: 16.sp,
    fontWeight: FontWeight.w500,
  );
}
