import 'package:clicks_technician/core/components/app_button.dart';
import 'package:clicks_technician/core/helper/app_snack_bars.dart';
import 'package:clicks_technician/core/helper/extensions.dart';
import 'package:clicks_technician/core/routing/routes.dart';
import 'package:clicks_technician/core/theme/colors_manager.dart';
import 'package:clicks_technician/features/auth/register/ui/cubit/register_cubit.dart';
import 'package:clicks_technician/features/auth/register/ui/view/widgets/register_step_five_view.dart';
import 'package:clicks_technician/features/auth/register/ui/view/widgets/register_step_four_view.dart';
import 'package:clicks_technician/features/auth/register/ui/view/widgets/register_step_one_view.dart';
import 'package:clicks_technician/features/auth/register/ui/view/widgets/register_step_three_view.dart';
import 'package:clicks_technician/features/auth/register/ui/view/widgets/register_step_two_view.dart';
import 'package:clicks_technician/features/auth/register/ui/view/widgets/register_steps_view.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

class RegisterScreen extends StatelessWidget {
  const RegisterScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Container(
          padding: EdgeInsets.all(16),
          width: MediaQuery.sizeOf(context).width,
          height: MediaQuery.sizeOf(context).height,
          child: BlocConsumer<RegisterCubit, RegisterState>(
            listener: (context, state) {
              if (state is RegisterError) {
                AppSnackBars.errorSnackBar(state.message);
              }
              if (state is RegisterSuccess || context.read<RegisterCubit>().step == 5) {
                context.offAllNamed(Routes.registerSuccess);
              }
            },
            builder: (context, state) {
              return Column(
                children: [
                  RegisterStepsView(),
                  Expanded(child: _buildRegisterSteps(context)),
                  _buildRegisterButtons(context),
                ],
              );
            },
          ),
        ),
      ),
    );
  }

  Widget _buildRegisterButtons(BuildContext context) {
    final cubit = context.read<RegisterCubit>();
    final loading = cubit.isLoading || context.watch<RegisterCubit>().state is RegisterLoading;

    switch (cubit.step) {
      case 1:
        if (cubit.showOTPView) {
          final valid = cubit.stepOTPValid;
          return AppButton(
            label: "Confirm",
            isLoading: loading,
            onPressed: () {
              if (valid) {
                cubit.verifyOtp();
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
            label: "Send OTP",
            isLoading: loading,
            onPressed: () {
              if (valid) {
                cubit.sendOtp();
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
        final valid = cubit.stepTwoValid;
        return AppButton(
          label: "Next",
          onPressed: () {
            if (valid) {
              cubit.nextStep();
            } else {
              AppSnackBars.errorSnackBar("Please Enter Valid Email Address");
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
      case 3:
        final valid = cubit.stepThreeValid;
        return AppButton(
          label: "Next",
          onPressed: () {
            if (valid) {
              cubit.nextStep();
            } else {
              AppSnackBars.errorSnackBar(
                cubit.errorStepThree ?? "Please Enter all data required",
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
      case 4:
        final valid = cubit.stepFourValid;
        return AppButton(
          label: "Submit",
          isLoading: loading,
          onPressed: () {
            if (valid) {
              cubit.submitRegistration();
            } else {
              AppSnackBars.errorSnackBar("Upload All Images Required");
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

  Widget _buildRegisterSteps(BuildContext context) {
    switch (context.read<RegisterCubit>().step) {
      case 1:
        return RegisterStepOneView();
      case 2:
        return RegisterStepTwoView();
      case 3:
        return RegisterStepThreeView();
      case 4:
        return RegisterStepFourView();
      case 5:
        return RegisterStepFiveView();
      default:
        return RegisterStepOneView();
    }
  }
}
