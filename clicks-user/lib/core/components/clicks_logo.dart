import 'package:clicks_user/core/helper/assets_manager.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_svg/flutter_svg.dart';

/// Official Clicks wordmark.
class ClicksLogo extends StatelessWidget {
  final double height;

  const ClicksLogo({super.key, this.height = 24});

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Clicks',
      image: true,
      child: SvgPicture.asset(
        AssetsManager.logoSvg,
        height: height.h,
        fit: BoxFit.contain,
        alignment: AlignmentDirectional.centerStart,
      ),
    );
  }
}
