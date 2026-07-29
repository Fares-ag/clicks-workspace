// lib/features/settings/ui/view/contact_us_success_screen.dart

import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/components/success_screen.dart';

class ContactUsSuccessScreen extends StatelessWidget {
  const ContactUsSuccessScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SuccessScreen(
      message:
          'settings.contact_success_msg'.tr(),
      buttonLabel: 'common.ok'.tr(),
      onButtonPressed: () {
        // Go back to previous screen (settings)
        Navigator.of(context).pop();
      },
    );
  }
}
