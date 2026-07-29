import 'package:clicks_technician/core/helper/extensions.dart';
import 'package:clicks_technician/core/routing/routes.dart';
import 'package:clicks_technician/features/auth/forget_password/ui/view/widgets/forget_password_step_one_view.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../../core/components/app_button.dart';
import '../../../../../core/helper/app_snack_bars.dart';
import '../../../../../core/theme/colors_manager.dart';
import '../cubit/forget_password_cubit.dart';
import 'widgets/forget_password_step_two_view.dart';
import 'widgets/forget_password_steps_view.dart';

class ForgetPasswordScreen extends StatelessWidget {
  const ForgetPasswordScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Container(
          padding: EdgeInsets.all(16),
          width: MediaQuery.sizeOf(context).width,
          height: MediaQuery.sizeOf(context).height,
          child: BlocConsumer<ForgetPasswordCubit, ForgetPasswordState>(
            listener: (context, state) {
              if (state is ForgetPasswordError) {
                AppSnackBars.errorSnackBar(state.message);
              }
              if (state is ForgetPasswordSuccess) {
                AppSnackBars.successSnackBar("Password reset successfully");
                context.offAllNamed(Routes.login);
              }
            },
            builder: (context, state) {
              return Column(
                children: [
                  ForgetPasswordStepsView(),
                  Expanded(child: _buildForm(context)),
                  _buildForgetPasswordButtons(context),
                ],
              );
            },
          ),
        ),
      ),
    );
  }

  Widget _buildForgetPasswordButtons(BuildContext context) {
    final cubit = context.read<ForgetPasswordCubit>();
    final loading = cubit.isLoading || stateIsLoading(context);

    switch (cubit.step) {
      case 1:
        if (cubit.showOTPView) {
          final valid = cubit.stepOTPValid;
          return AppButton(
            label: "Submit",
            isLoading: loading,
            onPressed: () {
              if (valid) {
                cubit.verifyResetOtp();
              } else {
                AppSnackBars.errorSnackBar("Please Enter Valid OTP");
              }
            },
            width: double.infinity,
            borderColor: valid ? null : const Color.fromARGB(255, 215, 215, 215),
            bgColor: !valid ? null : ColorsManager.mainColor,
            textColor: !valid ? Colors.black : Colors.white,
            margin: 0,
            fontWeight: FontWeight.w400,
            elevation: 0,
          );
        } else {
          final valid = cubit.stepOneValid;
          return AppButton(
            label: "Next",
            isLoading: loading,
            onPressed: () {
              if (valid) {
                cubit.sendResetOtp();
              } else {
                AppSnackBars.errorSnackBar("Please Enter Valid Phone Number");
              }
            },
            width: double.infinity,
            borderColor: valid ? null : const Color.fromARGB(255, 215, 215, 215),
            bgColor: !valid ? null : ColorsManager.mainColor,
            textColor: !valid ? Colors.black : Colors.white,
            margin: 0,
            fontWeight: FontWeight.w400,
            elevation: 0,
          );
        }

      case 2:
      case 3:
        final valid = cubit.stepTwoValid;
        return AppButton(
          isLoading: loading,
          label: "Reset Password",
          onPressed: () {
            if (valid) {
              cubit.resetPassword();
            } else {
              AppSnackBars.errorSnackBar(
                cubit.errorStepTwo ?? "Please Enter all data required",
              );
            }
          },
          width: double.infinity,
          borderColor: valid ? null : const Color.fromARGB(255, 215, 215, 215),
          bgColor: !valid ? null : ColorsManager.mainColor,
          textColor: !valid ? Colors.black : Colors.white,
          margin: 0,
          fontWeight: FontWeight.w400,
          elevation: 0,
        );

      default:
        return const SizedBox();
    }
  }

  bool stateIsLoading(BuildContext context) =>
      context.watch<ForgetPasswordCubit>().state is ForgetPasswordLoading;

  Widget _buildForm(BuildContext context) {
    switch (context.read<ForgetPasswordCubit>().step) {
      case 1:
        return ForgetPasswordStepOneView();
      case 2:
      case 3:
        return ForgetPasswordStepTwoView();
      default:
        return ForgetPasswordStepOneView();
    }
  }
}
