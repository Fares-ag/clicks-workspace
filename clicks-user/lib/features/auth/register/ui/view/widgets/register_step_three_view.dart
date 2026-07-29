import 'package:easy_localization/easy_localization.dart';
import '../../../../../../core/components/app_text_field.dart';
import '../../../../../../core/theme/text_styles.dart';
import '../../../../../../features/auth/register/ui/cubit/register_cubit.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

class RegisterStepThreeView extends StatelessWidget {
  const RegisterStepThreeView({super.key});

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(height: 32.h),
          Text(
            'auth.enter_info_below'.tr(),
            style: TextStyles.font16RegularBlack.copyWith(
              fontWeight: FontWeight.bold,
              color: Colors.black,
              fontSize: 20.sp,
            ),
          ),
          SizedBox(height: 16.h),

          AppTextFormField(
            hintText: 'auth.first_name'.tr(),
            type: AppTextFieldType.name,
            isDefaultValidation: false,
            controller: context.read<RegisterCubit>().firstNameController,
          ),
          SizedBox(height: 14.h),

          AppTextFormField(
            hintText: 'auth.last_name'.tr(),
            type: AppTextFieldType.name,
            isDefaultValidation: false,
            controller: context.read<RegisterCubit>().lastNameController,
          ),
          SizedBox(height: 14.h),

          AppTextFormField(
            hintText: 'auth.password'.tr(),
            type: AppTextFieldType.password,
            isDefaultValidation: false,
            controller: context.read<RegisterCubit>().passwordController,
            onChanged: (value) {
              context.read<RegisterCubit>().validateStepThree();
            },
          ),
          if (context.read<RegisterCubit>().errorStepThree != null) ...[
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
            hintText: 'auth.confirm_password'.tr(),
            type: AppTextFieldType.password,
            isDefaultValidation: false,
            controller: context.read<RegisterCubit>().confirmPasswordController,
            onChanged: (value) {
              context.read<RegisterCubit>().validateStepThree();
            },
          ),
          SizedBox(height: 14.h),

          AnimatedCrossFade(
            firstChild: Text(
              context.read<RegisterCubit>().errorStepThree ?? "",
              style: TextStyles.font14Regular.copyWith(
                color: Color(0xFFD92D20),
              ),
            ),
            secondChild: SizedBox(),
            crossFadeState:
                (context.read<RegisterCubit>().errorStepThree != null)
                    ? CrossFadeState.showFirst
                    : CrossFadeState.showSecond,
            duration: Duration(milliseconds: 300),
          ),
        ],
      ),
    );
  }
}
