import 'package:clicks_technician/core/components/app_button.dart';
import 'package:clicks_technician/core/helper/app_snack_bars.dart';
import 'package:clicks_technician/core/helper/assets_manager.dart';
import 'package:clicks_technician/core/helper/extensions.dart';
import 'package:clicks_technician/core/routing/routes.dart';
import 'package:clicks_technician/core/theme/colors_manager.dart';
import 'package:clicks_technician/core/theme/text_styles.dart';
import 'package:clicks_technician/features/auth/login/ui/cubit/login_cubit.dart';
import 'package:clicks_technician/features/status/ui/cubit/status_cubit.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../../../core/components/app_text_field.dart';

class LoginScreen extends StatelessWidget {
  LoginScreen({super.key});
  final GlobalKey<FormState> _globalKey = GlobalKey<FormState>();
  final TextEditingController _phoneController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        padding: EdgeInsets.all(16),
        width: MediaQuery.sizeOf(context).width,
        height: MediaQuery.sizeOf(context).height,
        decoration: BoxDecoration(
          image: DecorationImage(
            image: AssetImage(AssetsManager.loginBgImage),
            fit: BoxFit.cover,
          ),
        ),

        child: Column(
          mainAxisAlignment: MainAxisAlignment.end,
          children: [
            Container(
              alignment: AlignmentDirectional.centerStart,
              child: SvgPicture.asset(AssetsManager.loginIconSvg),
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
            'Login',
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
              'Signup',
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
            controller: _phoneController,
            hintStyle: TextStyles.font16RegularBlack.copyWith(
              color: Colors.black26,
              fontWeight: FontWeight.normal,
            ),
            hintText: "11111111",
            type: AppTextFieldType.phone,
            backgroundColor: Colors.white,
          ),
          AppTextFormField(
            controller: _passwordController,
            hintText: "Password",
            hintStyle: TextStyles.font16RegularBlack.copyWith(
              color: Colors.black26,
              fontWeight: FontWeight.normal,
            ),
            type: AppTextFieldType.password,
            backgroundColor: Colors.white,
            isObscureText: true,
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
          AppSnackBars.successSnackBar("Login Successfully");

          switch (state.applicationStatus.toLowerCase()) {
            case 'approved':
              context.offAllNamed(Routes.home);
              break;
            case 'rejected':
              context.offAllNamed(Routes.status, arguments: StatusType.rejected);
              break;
            default:
              context.offAllNamed(Routes.status, arguments: StatusType.pending);
          }
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
                    _phoneController.text.trim(),
                    _passwordController.text,
                  );
                }
              },
              label: "Sign In",
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
                "Forgot password?",
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
