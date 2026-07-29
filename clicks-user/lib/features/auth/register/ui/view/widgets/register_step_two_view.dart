import 'package:easy_localization/easy_localization.dart';
import '../../../../../../core/components/app_text_field.dart';
import '../../../../../../core/theme/text_styles.dart';
import '../../../../../../features/auth/register/ui/cubit/register_cubit.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

class RegisterStepTwoView extends StatelessWidget {
  const RegisterStepTwoView({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(height: 32.h),
        Text(
          'auth.enter_email_title'.tr(),
          style: TextStyles.font16RegularBlack.copyWith(
            fontWeight: FontWeight.bold,
            color: Colors.black,
            fontSize: 20.sp,
          ),
        ),
        SizedBox(height: 16.h),

        AppTextFormField(
          hintText: 'auth.email_address'.tr(),
          type: AppTextFieldType.email,
          isDefaultValidation: false,
          controller: context.read<RegisterCubit>().emailController,
          onChanged: (value) {
            context.read<RegisterCubit>().validateStepTwo();
          },
        ),
        SizedBox(height: 8.h),

        AnimatedCrossFade(
          firstChild: Text(
            "*Please enter valid Email Address",
            style: TextStyles.font14Regular.copyWith(color: Color(0xFFD92D20)),
          ),
          secondChild: SizedBox(),
          crossFadeState:
              (context.read<RegisterCubit>().emailController.text.isNotEmpty &&
                      !context.read<RegisterCubit>().stepTwoValid)
                  ? CrossFadeState.showFirst
                  : CrossFadeState.showSecond,
          duration: Duration(milliseconds: 300),
        ),
      ],
    );
  }
}
