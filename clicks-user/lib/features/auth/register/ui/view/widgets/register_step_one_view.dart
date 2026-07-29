import 'dart:async';
import 'package:easy_localization/easy_localization.dart';
import '../../../../../../core/components/app_text_field.dart';
import '../../../../../../core/theme/text_styles.dart';
import '../../../../../../features/auth/register/ui/cubit/register_cubit.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:pinput/pinput.dart';

class RegisterStepOneView extends StatelessWidget {
  const RegisterStepOneView({super.key});

  @override
  Widget build(BuildContext context) {
    if (context.read<RegisterCubit>().showOTPView) {
      return _OTPView();
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(height: 32.h),
        Text(
          'auth.enter_phone_verify'.tr(),
          style: TextStyles.font16RegularBlack.copyWith(
            fontWeight: FontWeight.bold,
            color: Colors.black,
            fontSize: 20.sp,
          ),
        ),
        SizedBox(height: 16.h),

        AppTextFormField(
          hintText: 'auth.phone_prefix'.tr(),
          type: AppTextFieldType.phone,
          isDefaultValidation: false,
          maxChar: 16,
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
      width: 46.w,
      height: 54.h,
      textStyle: TextStyle(
        fontSize: 22,
        fontWeight: FontWeight.w600,
        color: Color(0xFF2C3E50),
      ),
      decoration: BoxDecoration(
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
      onChanged: (value) {
        context.read<RegisterCubit>().validateOTP();
      },
    );
  }
}

class _OTPView extends StatefulWidget {
  @override
  State<_OTPView> createState() => _OTPViewState();
}

class _OTPViewState extends State<_OTPView> {
  late Timer _timer;
  int _seconds = 60;

  @override
  void initState() {
    super.initState();
    _startTimer();
  }

  void _startTimer() {
    _seconds = 60;
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (_seconds == 0) {
        t.cancel();
      } else {
        setState(() => _seconds--);
      }
    });
  }

  @override
  void dispose() {
    _timer.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final phone = context.read<RegisterCubit>().phoneController.text;
    return SizedBox(
      width: MediaQuery.sizeOf(context).width,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(height: 32.h),
          Text(
            'auth.enter_otp'.tr(),
            style: TextStyles.font16RegularBlack.copyWith(
              fontWeight: FontWeight.bold,
              color: Colors.black,
              fontSize: 20.sp,
            ),
          ),
          SizedBox(height: 8.h),
          Text(
            'auth.otp_sent_to'.tr(),
            style: TextStyles.font16RegularBlack.copyWith(
              color: Color(0xff797979),
              fontSize: 15.sp,
            ),
          ),
          SizedBox(height: 4.h),
          Text(
            phone,
            style: TextStyles.font16RegularBlack.copyWith(
              color: Color(0xff252525),
              fontSize: 15.sp,
            ),
          ),
          SizedBox(height: 24.h),
          CustomOTPField(),
          SizedBox(height: 8.h),
          if (_seconds > 0)
            Text(
              '$_seconds seconds remaining..',
              style: TextStyles.font14Regular,
            ),
          SizedBox(height: 16.h),
          Row(
            children: [
              Text(
                'auth.didnt_receive'.tr(),
                style: TextStyles.font14Regular.copyWith(
                  color: Color(0xff98A2B3),
                ),
              ),
              GestureDetector(
                onTap: _seconds == 0
                    ? () {
                        context.read<RegisterCubit>().sendOtpToPhone();
                        _startTimer();
                      }
                    : null,
                child: Text(
                  'auth.send_again'.tr(),
                  style: TextStyles.font14Regular.copyWith(
                    color: _seconds == 0
                        ? Color(0xffD92D2D)
                        : Color(0xff98A2B3),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
