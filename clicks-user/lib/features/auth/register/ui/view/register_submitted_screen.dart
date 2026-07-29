import 'package:easy_localization/easy_localization.dart';
import '../../../../../core/components/app_button.dart';
import '../../../../../core/helper/extensions.dart';
import '../../../../../core/routing/routes.dart';
import '../../../../../core/theme/colors_manager.dart';
import '../../../../../core/theme/text_styles.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

class RegisterSubmittedScreen extends StatelessWidget {
  const RegisterSubmittedScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: ColorsManager.mainColor,

      body: Center(
        child: Column(
          spacing: 12.h,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              'auth.app_submitted'.tr(),
              textAlign: TextAlign.center,
              style: TextStyles.font24Medium.copyWith(color: Colors.white),
            ),
            AppButton(
              onPressed: () {
                context.offAllNamed(Routes.login);
              },
              label: 'common.ok'.tr(),
              width: double.infinity,
              textColor: Colors.black,
            ),
          ],
        ),
      ),
    );
  }
}
