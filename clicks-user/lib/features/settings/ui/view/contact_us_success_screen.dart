// lib/features/settings/ui/view/contact_us_success_screen.dart

import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/components/success_screen.dart';

class ContactUsSuccessScreen extends StatelessWidget {
  const ContactUsSuccessScreen({super.key, this.ticketNumber});

  /// Server-assigned ticket number, shown so the customer can quote it.
  final String? ticketNumber;

  @override
  Widget build(BuildContext context) {
    final number = ticketNumber;
    return SuccessScreen(
      message: number != null && number.isNotEmpty
          ? 'settings.contact_success_ticket'.tr(namedArgs: {'number': number})
          : 'settings.contact_success_msg'.tr(),
      buttonLabel: 'common.ok'.tr(),
      onButtonPressed: () {
        // Go back to previous screen (settings)
        Navigator.of(context).pop();
      },
    );
  }
}
