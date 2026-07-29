import 'package:easy_localization/easy_localization.dart';
import '../../../../../core/components/app_button.dart';
import '../../../../../core/helper/app_snack_bars.dart';
import '../../../../../core/helper/extensions.dart';
import '../../../../../core/routing/routes.dart';
import '../../../../../core/theme/colors_manager.dart';
import '../../../../../features/auth/register/ui/cubit/register_cubit.dart';
import '../../../../../features/auth/register/ui/view/widgets/register_step_one_view.dart';
import '../../../../../features/auth/register/ui/view/widgets/register_step_three_view.dart';
import '../../../../../features/auth/register/ui/view/widgets/register_step_two_view.dart';
import '../../../../../features/auth/register/ui/view/widgets/register_steps_view.dart';
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
              if (state is ErrorRegisterState) {
                AppSnackBars.errorSnackBar(state.message);
              } else if (state is SuccessRegisterState) {
                AppSnackBars.successSnackBar('auth.account_created'.tr());
                context.offAllNamed(Routes.registerSuccess);
              } else if (context.read<RegisterCubit>().step == 4 &&
                  state is ChangeProgressRegister) {
                context.read<RegisterCubit>().createAccount();
              }
            },
            builder: (context, state) {
              if (state is LoadingRegisterState) {
                return Center(child: CircularProgressIndicator());
              }
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
    switch (context.read<RegisterCubit>().step) {
      case 1:
        if (context.read<RegisterCubit>().showOTPView) {
          bool valid = context.read<RegisterCubit>().stepOTPValid;

          return AppButton(
            label: 'auth.confirm_otp'.tr(),
            onPressed: () {
              if (valid) {
                context.read<RegisterCubit>().verifyOtpCode();
              } else {
                AppSnackBars.errorSnackBar('auth.invalid_otp'.tr());
              }
            },
            width: double.infinity,
            borderColor: valid ? null : Color.fromARGB(255, 215, 215, 215),

            bgColor: !valid ? null : ColorsManager.mainColor,
            textColor: !valid ? Colors.black : Colors.white,
            margin: 0,
            fontWeight: FontWeight.w400,
            elevation: 0,
          );
        } else {
          bool valid = context.read<RegisterCubit>().stepOneValid;
          return AppButton(
            label: 'common.next'.tr(),
            onPressed: () {
              if (valid) {
                context.read<RegisterCubit>().sendOtpToPhone();
              } else {
                AppSnackBars.errorSnackBar('auth.invalid_phone'.tr());
              }
            },
            width: double.infinity,
            borderColor: valid ? null : Color.fromARGB(255, 215, 215, 215),

            bgColor: !valid ? null : ColorsManager.mainColor,
            textColor: !valid ? Colors.black : Colors.white,
            margin: 0,
            fontWeight: FontWeight.w400,
            elevation: 0,
          );
        }

      case 2:
        bool valid = context.read<RegisterCubit>().stepTwoValid;

        return AppButton(
          label: 'common.next'.tr(),
          onPressed: () {
            if (valid) {
              context.read<RegisterCubit>().nextStep();
            } else {
              AppSnackBars.errorSnackBar('auth.invalid_email'.tr());
            }
          },
          width: double.infinity,
          borderColor: valid ? null : Color.fromARGB(255, 215, 215, 215),

          bgColor: !valid ? null : ColorsManager.mainColor,
          textColor: !valid ? Colors.black : Colors.white,
          margin: 0,
          fontWeight: FontWeight.w400,
          elevation: 0,
        );
      case 3:
        bool valid = context.read<RegisterCubit>().stepThreeValid;

        return AppButton(
          label: 'common.submit'.tr(),
          onPressed: () {
            if (valid) {
              context.read<RegisterCubit>().nextStep();
            } else {
              AppSnackBars.errorSnackBar(
                context.read<RegisterCubit>().errorStepThree ??
                    'auth.enter_all_data'.tr(),
              );
            }
          },
          width: double.infinity,
          borderColor: valid ? null : Color.fromARGB(255, 215, 215, 215),

          bgColor: !valid ? null : ColorsManager.mainColor,
          textColor: !valid ? Colors.black : Colors.white,
          margin: 0,
          fontWeight: FontWeight.w400,
          elevation: 0,
        );

      default:
        return SizedBox();
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

      default:
        return RegisterStepThreeView();
    }
  }
}
