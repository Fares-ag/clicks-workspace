import '../../../../../core/components/app_button.dart';
import '../../../../../core/helper/app_snack_bars.dart';
import '../../../../../core/helper/assets_manager.dart';
import '../../../../../core/helper/extensions.dart';
import '../../../../../core/routing/routes.dart';
import '../../../../../core/theme/colors_manager.dart';
import '../../../../../core/theme/text_styles.dart';
import '../../../../../features/auth/login/ui/cubit/login_cubit.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import 'package:flutter_svg/flutter_svg.dart';

import '../../../../../core/components/app_text_field.dart';

class LoginScreen extends StatelessWidget {
  LoginScreen({super.key});
  final GlobalKey<FormState> _globalKey = GlobalKey<FormState>();

  final phoneController = TextEditingController();
  final passController = TextEditingController();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      resizeToAvoidBottomInset: true,
      body: Container(
        width: MediaQuery.sizeOf(context).width,
        height: MediaQuery.sizeOf(context).height,
        decoration: BoxDecoration(
          image: DecorationImage(
            image: AssetImage(AssetsManager.loginBgImage),
            fit: BoxFit.cover,
          ),
        ),
        child: SingleChildScrollView(
          padding: EdgeInsets.all(16),
          child: SizedBox(
            height: MediaQuery.sizeOf(context).height - 32,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                Container(
                  alignment: AlignmentDirectional.centerStart,
                  child: SvgPicture.asset(AssetsManager.loginIconSvg, height: 36),
                ),
                SizedBox(height: 24.h),
                _buildLoginSignupWords(context),
                SizedBox(height: 24.h),
                _buildFormSignIn(),
                SizedBox(height: 24.h),
                _buildSignInButton(),
                SizedBox(height: 55.h),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildLoginSignupWords(BuildContext context) {
    return Row(
      spacing: 12.w,
      children: [
        Container(
          padding: EdgeInsets.only(bottom: 4.h),
          decoration: BoxDecoration(
            border: Border(bottom: BorderSide(color: Colors.white, width: 2.0)),
          ),
          child: Text(
            'auth.login'.tr(),
            style: TextStyles.font24Medium.copyWith(
              color: Colors.white,
              fontWeight: FontWeight.bold,
            ),
          ),
        ),

        InkWell(
          onTap: () {
            context.toNamed(Routes.register);
          },
          child: Container(
            padding: EdgeInsets.only(bottom: 4.h),
            child: Text(
              'auth.signup'.tr(),
              style: TextStyles.font24Medium.copyWith(color: Colors.white),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildFormSignIn() {
    return Form(
      key: _globalKey,
      child: Column(
        spacing: 14.h,
        children: [
          AppTextFormField(
            controller: phoneController,
            hintStyle: TextStyles.font16RegularBlack.copyWith(
              color: Colors.black26,
              fontWeight: FontWeight.normal,
            ),
            hintText: 'auth.phone_number'.tr(),
            type: AppTextFieldType.phone,
            backgroundColor: Colors.white,
          ),
          AppTextFormField(
            controller: passController,
            hintText: 'auth.password'.tr(),
            hintStyle: TextStyles.font16RegularBlack.copyWith(
              color: Colors.black26,
              fontWeight: FontWeight.normal,
            ),
            type: AppTextFieldType.password,
            backgroundColor: Colors.white,
            isObscureText: true,
            isDefaultValidation: false,
            validator: (value) {
              if (value == null || value.trim().isEmpty) {
                return 'auth.please_enter_password'.tr();
              }
              return null;
            },
          ),
        ],
      ),
    );
  }

  Widget _buildSignInButton() {
    return BlocConsumer<LoginCubit, LoginState>(
      listener: (context, state) {
        if (state is LoginError) {
          AppSnackBars.errorSnackBar(state.message);
        } else if (state is LoginSuccess) {
          AppSnackBars.successSnackBar('auth.login_success'.tr());

          context.offAllNamed(Routes.home);
        }
      },
      builder: (context, state) {
        return Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            AppButton(
              isLoading: state is LoginLoading,
              onPressed: () {
                if (_globalKey.currentState?.validate() ?? false) {
                  context.read<LoginCubit>().login(
                    phoneController.text,
                    passController.text,
                  );
                }
              },
              label: 'auth.sign_in'.tr(),
              margin: 0,
              bgColor: ColorsManager.mainColor,
              width: 100.w,
              height: 44.h,
              radius: 8.r,
              textColor: Colors.white,
              fontSize: 14.sp,
              fontWeight: FontWeight.bold,
            ),
            InkWell(
              onTap: () {
                context.toNamed(Routes.forgetPassword);
              },
              child: Text(
                'auth.forgot_password'.tr(),
                style: TextStyles.font16RegularBlack.copyWith(
                  color: Colors.white,
                  fontSize: 14.sp,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}
