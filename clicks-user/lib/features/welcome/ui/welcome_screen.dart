import '../../../../../core/components/app_button.dart';
import '../../../../../core/helper/assets_manager.dart';
import '../../../../../core/helper/extensions.dart';
import '../../../../../core/routing/routes.dart';
import '../../../../../core/theme/colors_manager.dart';
import '../../../../../core/theme/text_styles.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_svg/flutter_svg.dart';

class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: ColorsManager.mainColor,
      body: SizedBox(
        width: MediaQuery.sizeOf(context).width,
        height: MediaQuery.sizeOf(context).height,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Container(
              margin: EdgeInsetsDirectional.only(top: 65.h, start: 13.w),
              alignment: AlignmentDirectional.centerStart,
              child: SvgPicture.asset(
                AssetsManager.loginIconSvg,
                height: 36,
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'welcome.assisted'.tr(),
                  style: TextStyles.font28Bold.copyWith(
                    fontSize: 43.sp,
                    color: Colors.white,
                  ),
                ),
                Text(
                  'welcome.anytime'.tr(),
                  style: TextStyles.font28Bold.copyWith(
                    fontSize: 43.sp,
                    color: Colors.white,
                  ),
                ),
                Text(
                  'welcome.anywhere'.tr(),
                  style: TextStyles.font28Bold.copyWith(
                    fontSize: 43.sp,
                    color: Colors.white,
                  ),
                ),
                Text(
                  'welcome.one_click'.tr(),
                  style: TextStyles.font28Bold.copyWith(
                    fontSize: 43.sp,
                    color: Colors.white,
                  ),
                ),
              ],
            ),
            AppButton(
              isLoading: false,
              width: double.infinity,
              onPressed: () {
                context.offNamed(Routes.login);
              },
              label: 'welcome.get_started'.tr(),
            ),
          ],
        ),
      ),
    );
  }
}
