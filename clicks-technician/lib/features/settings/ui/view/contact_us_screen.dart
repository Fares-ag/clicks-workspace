import 'package:clicks_technician/core/components/app_button.dart';
import 'package:clicks_technician/core/components/app_text_field.dart';
import 'package:clicks_technician/core/helper/app_snack_bars.dart';
import 'package:clicks_technician/core/helper/extensions.dart';
import 'package:clicks_technician/core/theme/colors_manager.dart';
import 'package:clicks_technician/core/theme/text_styles.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

/// Contact form (soft launch — no backend).
class ContactUsScreen extends StatefulWidget {
  const ContactUsScreen({super.key});

  @override
  State<ContactUsScreen> createState() => _ContactUsScreenState();
}

class _ContactUsScreenState extends State<ContactUsScreen> {
  final _formKey = GlobalKey<FormState>();
  final _subjectCtrl = TextEditingController();
  final _messageCtrl = TextEditingController();

  @override
  void dispose() {
    _subjectCtrl.dispose();
    _messageCtrl.dispose();
    super.dispose();
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) return;
    AppSnackBars.successSnackBar(
      'Message sent — we will get back to you',
    );
    context.pop();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        title: Text(
          'Contact Us',
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
              nameText: 'Subject',
              hintText: 'Subject',
              type: AppTextFieldType.text,
              controller: _subjectCtrl,
            ),
            SizedBox(height: 12.h),
            AppTextFormField(
              nameText: 'Message',
              hintText: 'Message',
              type: AppTextFieldType.any,
              maxLines: 5,
              controller: _messageCtrl,
            ),
            SizedBox(height: 24.h),
            AppButton(
              onPressed: _submit,
              label: 'Submit',
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
