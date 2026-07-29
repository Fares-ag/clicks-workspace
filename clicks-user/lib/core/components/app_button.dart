import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:shimmer/shimmer.dart';

import '../theme/colors_manager.dart';
import '../theme/text_styles.dart';

class AppButton extends StatelessWidget {
  const AppButton({
    super.key,
    this.onPressed,
    this.width,
    required this.label,
    this.bgColor,
    this.height,
    this.radius,
    this.isLoading = false,
    this.textColor,
    this.margin,
    this.fontSize,
    this.fontWeight,
    this.borderColor,
    this.elevation,
    this.icon,
  });
  final void Function()? onPressed;
  final double? width;
  final String label;
  final Color? bgColor;
  final double? height;
  final double? radius;
  final double? margin;
  final bool isLoading;
  final Color? textColor;
  final double? fontSize;
  final FontWeight? fontWeight;
  final Color? borderColor;
  final double? elevation;
  final String? icon;

  @override
  Widget build(BuildContext context) {
    final button = Container(
      margin: EdgeInsets.all(margin ?? 20),
      decoration: BoxDecoration(
        color: bgColor ?? ColorsManager.whiteColor,
        borderRadius: BorderRadius.circular(radius ?? 14.r),
      ),
      child: MaterialButton(
        elevation: elevation ?? 2,
        onPressed: onPressed,

        minWidth: width,
        color: bgColor ?? ColorsManager.whiteColor,
        height: height ?? 55.h,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radius ?? 14.r),
          side:
              borderColor == null
                  ? BorderSide.none
                  : BorderSide(color: borderColor!),
        ),
        child:
            icon != null
                ? Row(
                  spacing: 16.w,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      label,
                      style: TextStyles.font16RegularBlack.copyWith(
                        color: textColor,
                        fontSize: fontSize,
                        fontWeight: fontWeight,
                      ),
                    ),
                    SvgPicture.asset(icon!),
                  ],
                )
                : Text(
                  label,
                  style: TextStyles.font16RegularBlack.copyWith(
                    color: textColor,
                    fontSize: fontSize,
                    fontWeight: fontWeight,
                  ),
                ),
      ),
    );

    if (isLoading) {
      return Shimmer.fromColors(
        baseColor: ColorsManager.mainColor,
        highlightColor: const Color.fromARGB(255, 190, 62, 62),
        child: button,
      );
    }

    return button;
  }
}
