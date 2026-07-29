import 'package:clicks_technician/core/components/app_text_field.dart';
import 'package:clicks_technician/core/theme/text_styles.dart';
import 'package:clicks_technician/features/auth/register/ui/cubit/register_cubit.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:pinput/pinput.dart';

class RegisterStepOneView extends StatelessWidget {
  const RegisterStepOneView({super.key});

  @override
  Widget build(BuildContext context) {
    if (context.read<RegisterCubit>().showOTPView) {
      return SizedBox(
        width: MediaQuery.sizeOf(context).width,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(height: 32.h),
            Text(
              "Enter OTP",
              style: TextStyles.font16RegularBlack.copyWith(
                fontWeight: FontWeight.bold,
                color: Colors.black,
                fontSize: 20.sp,
              ),
            ),
            SizedBox(height: 8.h),
            Text(
              "Your OTP code was sent to:",
              style: TextStyles.font16RegularBlack.copyWith(
                color: Color(0xff797979),
                fontSize: 15.sp,
              ),
            ),
            SizedBox(height: 4.h),
            Text(
              context.read<RegisterCubit>().phoneController.text,
              style: TextStyles.font16RegularBlack.copyWith(
                color: Color(0xff252525),
                fontSize: 15.sp,
              ),
            ),
            SizedBox(height: 24.h),

            CustomOTPField(),
            SizedBox(height: 8.h),

            Text(
              "55 seconds remaining..",
              style: TextStyles.font14Regular.copyWith(),
            ),
            SizedBox(height: 16.h),

            Row(
              children: [
                Text(
                  "Didn't receive a code? ",
                  style: TextStyles.font14Regular.copyWith(
                    color: Color(0xff98A2B3),
                  ),
                ),
                Text(
                  "Send Again.",
                  style: TextStyles.font14Regular.copyWith(
                    color: Color(0xffD92D2D),
                  ),
                ),
              ],
            ),
          ],
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(height: 32.h),
        Text(
          "Please enter your phone number we will send you a verification code",
          style: TextStyles.font16RegularBlack.copyWith(
            fontWeight: FontWeight.bold,
            color: Colors.black,
            fontSize: 20.sp,
          ),
        ),
        SizedBox(height: 16.h),

        AppTextFormField(
          hintText: "+ 974",
          type: AppTextFieldType.phone,
          isDefaultValidation: false,
          maxChar: 12,
          controller: context.read<RegisterCubit>().phoneController,
          onChanged: (value) {
            context.read<RegisterCubit>().validateStepOne();
          },
        ),
        SizedBox(height: 8.h),

        AnimatedCrossFade(
          firstChild: Text(
            "*Please enter valid phone number",
            style: TextStyles.font14Regular.copyWith(color: Color(0xFFD92D20)),
          ),
          secondChild: SizedBox(),
          crossFadeState:
              (context.read<RegisterCubit>().phoneController.text.isNotEmpty &&
                      !context.read<RegisterCubit>().stepOneValid)
                  ? CrossFadeState.showFirst
                  : CrossFadeState.showSecond,
          duration: Duration(milliseconds: 300),
        ),
      ],
    );
  }
}

class CustomOTPField extends StatelessWidget {
  const CustomOTPField({super.key});

  @override
  Widget build(BuildContext context) {
    final defaultPinTheme = PinTheme(
      width: 50.w,
      height: 54.h,
      textStyle: TextStyle(
        fontSize: 24,
        fontWeight: FontWeight.w600,
        color: Color(0xFF2C3E50),
      ),
      decoration: BoxDecoration(
        // color: Color(0xFFF8F9FA),
        border: Border.all(color: Color(0xFF494949), width: 1),
        borderRadius: BorderRadius.circular(8.r),
      ),
    );

    return Pinput(
      length: 6,
      defaultPinTheme: defaultPinTheme,
      pinputAutovalidateMode: PinputAutovalidateMode.onSubmit,
      showCursor: true,
      controller: context.read<RegisterCubit>().otpController,
      onCompleted: (pin) {
        assert(() {
          // ignore: avoid_print
          print("OTP Completed: $pin");
          return true;
        }());
      },
      onChanged: (value) {
        context.read<RegisterCubit>().validateOTP();
      },
    );
  }
}
