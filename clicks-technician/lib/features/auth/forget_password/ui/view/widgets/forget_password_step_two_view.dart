import 'package:clicks_technician/core/components/app_text_field.dart';
import 'package:clicks_technician/core/theme/text_styles.dart';
import 'package:clicks_technician/features/auth/forget_password/ui/cubit/forget_password_cubit.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

class ForgetPasswordStepTwoView extends StatelessWidget {
  const ForgetPasswordStepTwoView({super.key});

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(height: 32.h),
          Text(
            "Rest your password reset",
            style: TextStyles.font16RegularBlack.copyWith(
              fontWeight: FontWeight.bold,
              color: Colors.black,
              fontSize: 20.sp,
            ),
          ),
          SizedBox(height: 8.h),
          Text(
            "Please enter a new password.",
            style: TextStyles.font16RegularBlack.copyWith(
              color: Color(0xff797979),
              fontSize: 15.sp,
            ),
          ),
          SizedBox(height: 16.h),

          AppTextFormField(
            hintText: "Enter new Password",
            type: AppTextFieldType.password,
            isDefaultValidation: false,
            controller: context.read<ForgetPasswordCubit>().passwordController,
            onChanged: (value) {
              context.read<ForgetPasswordCubit>().validateStepTwo();
            },
          ),
          if (context.read<ForgetPasswordCubit>().errorStepTwo != null) ...[
            SizedBox(height: 8.h),
            Text(
              """
*Minimum 8 characters.
*At least one uppercase letter.
*At least one lowercase letter.
*At least one number.
*At least one special character (!@#\$%^&*).
""",
              style: TextStyles.font12RegularGrey.copyWith(
                color: Color(0xff494949),
              ),
            ),
          ],

          SizedBox(height: 14.h),

          AppTextFormField(
            hintText: "Confirm new password",
            type: AppTextFieldType.password,
            isDefaultValidation: false,
            controller:
                context.read<ForgetPasswordCubit>().confirmPasswordController,
            onChanged: (value) {
              context.read<ForgetPasswordCubit>().validateStepTwo();
            },
          ),
          SizedBox(height: 14.h),

          AnimatedCrossFade(
            firstChild: Text(
              context.read<ForgetPasswordCubit>().errorStepTwo ?? "",
              style: TextStyles.font14Regular.copyWith(
                color: Color(0xFFD92D20),
              ),
            ),
            secondChild: SizedBox(),
            crossFadeState:
                (context.read<ForgetPasswordCubit>().errorStepTwo != null)
                    ? CrossFadeState.showFirst
                    : CrossFadeState.showSecond,
            duration: Duration(milliseconds: 300),
          ),
        ],
      ),
    );
  }
}
