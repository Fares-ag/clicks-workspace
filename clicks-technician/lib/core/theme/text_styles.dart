import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:google_fonts/google_fonts.dart';

import 'colors_manager.dart';
import 'font_weight_helper.dart';

/// A class that provides predefined text styles for the application.
class TextStyles {
  /// A bold text style with a font size of 32.

  /// A regular text style with a font size of 14.
  static TextStyle get font14Regular => GoogleFonts.poppins(
    fontSize: 14.sp,
    fontWeight: FontWeightHelper.regular,
  );

  static TextStyle get font14Medium =>
      GoogleFonts.poppins(fontSize: 14.sp, fontWeight: FontWeightHelper.medium);

  /// A regular grey text style with a font size of 14.
  static TextStyle get font14RegularGrey => GoogleFonts.poppins(
    fontSize: 14.sp,
    fontWeight: FontWeight.w400,
    color: Colors.grey,
  );

  static TextStyle get font14MediumGrey => GoogleFonts.poppins(
    fontSize: 14.sp,
    fontWeight: FontWeightHelper.medium,
    color: Colors.grey,
  );

  /// A regular black text style with a font size of 16.
  static TextStyle get font16RegularBlack =>
      GoogleFonts.poppins(fontSize: 16.sp, fontWeight: FontWeight.w400);

  /// A regular black text style with a font size of 12.
  static TextStyle get font12RegularBlack =>
      GoogleFonts.poppins(fontSize: 12.sp, fontWeight: FontWeight.w400);

  static TextStyle get font12SemiBoldMainColor => GoogleFonts.poppins(
    fontSize: 12.sp,
    fontWeight: FontWeightHelper.semiBold,
    color: ColorsManager.mainColor,
  );

  /// A medium text style with a font size of 24.
  static TextStyle get font24Medium =>
      GoogleFonts.poppins(fontSize: 24.sp, fontWeight: FontWeight.w500);

  /// A regular grey text style with a font size of 12.
  static TextStyle get font12RegularGrey => GoogleFonts.poppins(
    fontSize: 12.sp,
    fontWeight: FontWeight.w400,
    color: Colors.grey,
  );
  static TextStyle get font28Bold =>
      GoogleFonts.poppins(fontSize: 28, fontWeight: FontWeightHelper.bold);

  static TextStyle get font10Regular =>
      GoogleFonts.poppins(fontSize: 10, fontWeight: FontWeightHelper.regular);

  /// A medium text style for app buttons with a font size of 16.
  static TextStyle get fontAppButton =>
      GoogleFonts.poppins(fontSize: 16.sp, fontWeight: FontWeight.w500);
}
