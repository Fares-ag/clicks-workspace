import 'package:clicks_technician/core/components/app_button.dart';
import 'package:clicks_technician/core/helper/extensions.dart';
import 'package:clicks_technician/core/routing/routes.dart';
import 'package:clicks_technician/core/theme/colors_manager.dart';
import 'package:clicks_technician/core/theme/text_styles.dart';
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
              "Application submitted\nsuccessfully!",
              textAlign: TextAlign.center,
              style: TextStyles.font24Medium.copyWith(color: Colors.white),
            ),
            AppButton(
              onPressed: () {
                context.offAllNamed(Routes.login);
              },
              label: "Ok",
              width: double.infinity,
              textColor: Colors.black,
            ),
          ],
        ),
      ),
    );
  }
}
