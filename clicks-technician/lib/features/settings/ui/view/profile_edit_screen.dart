import 'package:clicks_technician/core/api/dio_helper.dart';
import 'package:clicks_technician/core/api/end_points/end_points.dart';
import 'package:clicks_technician/core/components/app_button.dart';
import 'package:clicks_technician/core/components/app_text_field.dart';
import 'package:clicks_technician/core/helper/app_snack_bars.dart';
import 'package:clicks_technician/core/helper/extensions.dart';
import 'package:clicks_technician/core/theme/colors_manager.dart';
import 'package:clicks_technician/core/theme/text_styles.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

/// Edit technician profile (firstName, lastName, email, phone).
class ProfileEditScreen extends StatefulWidget {
  const ProfileEditScreen({super.key, required this.profile});

  final Map<String, dynamic> profile;

  @override
  State<ProfileEditScreen> createState() => _ProfileEditScreenState();
}

class _ProfileEditScreenState extends State<ProfileEditScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _firstNameCtrl;
  late final TextEditingController _lastNameCtrl;
  late final TextEditingController _emailCtrl;
  late final TextEditingController _phoneCtrl;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _firstNameCtrl =
        TextEditingController(text: widget.profile['firstName']?.toString() ?? '');
    _lastNameCtrl =
        TextEditingController(text: widget.profile['lastName']?.toString() ?? '');
    _emailCtrl =
        TextEditingController(text: widget.profile['email']?.toString() ?? '');
    _phoneCtrl = TextEditingController(
      text: _toLocalDigits(widget.profile['phone']?.toString() ?? ''),
    );
  }

  static String _toLocalDigits(String raw) {
    var digits = raw.replaceAll(RegExp(r'\D'), '');
    // Only strip the 974 country code when the total is exactly 11 digits
    // (3 country code + 8 local). Guards against incorrectly stripping
    // numbers that merely happen to start with 974 in the local part.
    if (digits.startsWith('974') && digits.length == 11) {
      digits = digits.substring(3);
    }
    if (digits.length > 8) digits = digits.substring(digits.length - 8);
    return digits;
  }

  static String _toE164(String raw) {
    final local = _toLocalDigits(raw);
    if (RegExp(r'^\d{8}$').hasMatch(local)) return '+974$local';
    final trimmed = raw.trim().replaceAll(RegExp(r'[\s-]'), '');
    if (trimmed.isNotEmpty &&
        !trimmed.startsWith('+') &&
        RegExp(r'^\d+$').hasMatch(trimmed)) {
      return '+$trimmed';
    }
    return trimmed;
  }

  @override
  void dispose() {
    _firstNameCtrl.dispose();
    _lastNameCtrl.dispose();
    _emailCtrl.dispose();
    _phoneCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _saving = true);
    try {
      final res = await DioHelper.putData(
        url: EndPoints.profile,
        data: {
          'firstName': _firstNameCtrl.text.trim(),
          'lastName': _lastNameCtrl.text.trim(),
          'email': _emailCtrl.text.trim(),
          'phone': _toE164(_phoneCtrl.text),
        },
      );
      if (res.statusCode == 200) {
        AppSnackBars.successSnackBar('Profile updated');
        if (mounted) context.pop(true);
      } else {
        AppSnackBars.errorSnackBar(
          DioHelper.errorMessage(res) ?? 'Failed to update profile',
        );
      }
    } catch (_) {
      AppSnackBars.errorSnackBar('Failed to update profile');
    }
    if (mounted) setState(() => _saving = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        title: Text(
          'Edit Profile',
          style: TextStyles.font16RegularBlack
              .copyWith(fontWeight: FontWeight.bold),
        ),
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: EdgeInsets.fromLTRB(16.w, 8.h, 16.w, 24.h),
          children: [
            AppTextFormField(
              nameText: 'First name',
              hintText: 'First name',
              type: AppTextFieldType.name,
              controller: _firstNameCtrl,
            ),
            SizedBox(height: 12.h),
            AppTextFormField(
              nameText: 'Last name',
              hintText: 'Last name',
              type: AppTextFieldType.name,
              controller: _lastNameCtrl,
            ),
            SizedBox(height: 12.h),
            AppTextFormField(
              nameText: 'Email',
              hintText: 'Email',
              type: AppTextFieldType.email,
              controller: _emailCtrl,
            ),
            SizedBox(height: 12.h),
            AppTextFormField(
              nameText: 'Phone',
              hintText: '12345678',
              type: AppTextFieldType.phone,
              controller: _phoneCtrl,
            ),
            SizedBox(height: 24.h),
            AppButton(
              onPressed: _saving ? null : _save,
              label: _saving ? 'Saving…' : 'Save',
              isLoading: _saving,
              margin: 0,
              width: double.infinity,
              bgColor: ColorsManager.mainColor,
              textColor: Colors.white,
              height: 48.h,
              radius: 10.r,
            ),
          ],
        ),
      ),
    );
  }
}
