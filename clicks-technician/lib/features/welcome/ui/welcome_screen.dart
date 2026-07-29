import 'package:clicks_technician/core/components/app_button.dart';
import 'package:clicks_technician/core/helper/app_snack_bars.dart';
import 'package:clicks_technician/core/helper/assets_manager.dart';
import 'package:clicks_technician/core/helper/extensions.dart';
import 'package:clicks_technician/core/routing/routes.dart';
import 'package:clicks_technician/core/theme/colors_manager.dart';
import 'package:clicks_technician/core/theme/text_styles.dart';
import 'package:clicks_technician/features/welcome/ui/cubit/welcome_cubit.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_svg/svg.dart';

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
                  "Assisted",
                  style: TextStyles.font28Bold.copyWith(
                    fontSize: 43.sp,
                    color: Colors.white,
                  ),
                ),
                Text(
                  "Anytime,",
                  style: TextStyles.font28Bold.copyWith(
                    fontSize: 43.sp,
                    color: Colors.white,
                  ),
                ),
                Text(
                  "Anywhere,",
                  style: TextStyles.font28Bold.copyWith(
                    fontSize: 43.sp,
                    color: Colors.white,
                  ),
                ),
                Text(
                  "Just a Click Away",
                  style: TextStyles.font28Bold.copyWith(
                    fontSize: 43.sp,
                    color: Colors.white,
                  ),
                ),
              ],
            ),

            BlocConsumer<WelcomeCubit, WelcomeState>(
              listener: (context, state) {
                if (state is WelcomeError) {
                  AppSnackBars.errorSnackBar(state.message);
                } else if (state is WelcomeSuccess) {
                  AppSnackBars.successSnackBar("Got Location successfully");
                  context.offNamed(Routes.login);
                }
              },
              builder: (context, state) {
                return AppButton(
                  isLoading: state is WelcomeLoading,
                  width: double.infinity,
                  onPressed: () {
                    context.read<WelcomeCubit>().getPosition();
                  },
                  label: "Get Started",
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}
