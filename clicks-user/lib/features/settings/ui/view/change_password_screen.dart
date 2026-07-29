import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/api/dio_helper.dart';
import '../../../../core/api/end_points.dart';
import '../../../../core/components/app_button.dart';
import '../../../../core/components/app_text_field.dart';
import '../../../../core/theme/colors_manager.dart';
import '../../../../core/theme/text_styles.dart';

class ChangePasswordScreen extends StatefulWidget {
  const ChangePasswordScreen({super.key});

  @override
  State<ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends State<ChangePasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  final _currentPasswordController = TextEditingController();
  final _newPasswordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();

  bool _isLoading = false;

  @override
  void dispose() {
    _currentPasswordController.dispose();
    _newPasswordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  Future<void> _changePassword() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isLoading = true);

    try {
      final response = await DioHelper.postData(
        url: EndPoints.changePassword,
        data: {
          'oldPassword': _currentPasswordController.text,
          'newPassword': _newPasswordController.text,
        },
        auth: true,
      );

      if (!mounted) return;

      if (response.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('settings.password_changed'.tr()),
            backgroundColor: Colors.green,
          ),
        );
        Navigator.pop(context);
      } else {
        final msg = response.data is Map
            ? (response.data['message'] ??
                response.data['error'] ??
                'settings.failed_change_password'.tr())
            : 'settings.failed_change_password'.tr();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(msg), backgroundColor: Colors.red),
        );
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
      );
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        shape: const Border(bottom: BorderSide(color: Colors.grey, width: 1.0)),
        centerTitle: false,
        title: Text(
          'settings.change_password'.tr(),
          style: TextStyles.font16RegularBlack.copyWith(
            fontWeight: FontWeight.bold,
            fontSize: 20.sp,
          ),
        ),
      ),
      body: SingleChildScrollView(
        padding: EdgeInsets.all(16.w),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(height: 16.h),

              // Current Password
              Text(
                'settings.current_password'.tr(),
                style: TextStyles.font14Medium,
              ),
              SizedBox(height: 8.h),
              AppTextFormField(
                controller: _currentPasswordController,
                hintText: 'settings.enter_current_password'.tr(),
                type: AppTextFieldType.password,
                isDefaultValidation: false,
                validator: (value) {
                  if (value == null || value.isEmpty) {
                    return 'settings.please_enter_current'.tr();
                  }
                  return null;
                },
              ),

              SizedBox(height: 20.h),

              // New Password
              Text(
                'auth.new_password'.tr(),
                style: TextStyles.font14Medium,
              ),
              SizedBox(height: 8.h),
              AppTextFormField(
                controller: _newPasswordController,
                hintText: 'settings.enter_new_password'.tr(),
                type: AppTextFieldType.password,
                isDefaultValidation: false,
                validator: (value) {
                  if (value == null || value.isEmpty) {
                    return 'settings.please_enter_new'.tr();
                  }
                  if (value.length < 6) {
                    return 'settings.password_min_length'.tr();
                  }
                  return null;
                },
              ),

              SizedBox(height: 20.h),

              // Confirm Password
              Text(
                'auth.confirm_password'.tr(),
                style: TextStyles.font14Medium,
              ),
              SizedBox(height: 8.h),
              AppTextFormField(
                controller: _confirmPasswordController,
                hintText: 'settings.confirm_new_password'.tr(),
                type: AppTextFieldType.password,
                isDefaultValidation: false,
                validator: (value) {
                  if (value == null || value.isEmpty) {
                    return 'settings.please_confirm_password'.tr();
                  }
                  if (value != _newPasswordController.text) {
                    return 'settings.passwords_no_match'.tr();
                  }
                  return null;
                },
              ),

              SizedBox(height: 40.h),

              // Submit Button
              AppButton(
                onPressed: _isLoading ? null : _changePassword,
                label: _isLoading
                    ? 'settings.changing_password'.tr()
                    : 'settings.change_password'.tr(),
                bgColor: ColorsManager.mainColor,
                textColor: Colors.white,
                width: double.infinity,
                height: 48,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
