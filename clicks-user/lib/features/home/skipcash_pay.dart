import 'package:clicks_user/core/routing/app_page_route.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import 'skipcash_api.dart';
import 'skipcash_checkout_screen.dart';

enum SkipcashPayResult { paid, failed, unavailable, cancelled }

class SkipcashPay {
  SkipcashPay._();

  static Future<SkipcashPayResult> start(
    BuildContext context,
    String jobId,
  ) async {
    if (jobId.isEmpty) return SkipcashPayResult.unavailable;
    try {
      final session = await SkipcashApi.createSession(jobId);
      if (!context.mounted) return SkipcashPayResult.cancelled;
      if (session.alreadyPaid) return SkipcashPayResult.paid;
      final payUrl = session.payUrl;
      if (payUrl == null || payUrl.isEmpty) {
        return SkipcashPayResult.unavailable;
      }
      final paid = await Navigator.of(context).push<bool>(
        AppPageRoute(
          page: SkipcashCheckoutScreen(
            args: SkipcashCheckoutArgs(
              jobId: jobId,
              payUrl: payUrl,
              returnUrl: session.returnUrl ?? '',
              summaryTitle: 'home.pay_job_title'.tr(),
              // The amount SkipCash will charge, as priced by the server.
              summaryAmount: (session.amount ?? '').isNotEmpty
                  ? '${'common.qar'.tr()} ${session.amount}'
                  : null,
            ),
          ),
        ),
      );
      if (paid == true) return SkipcashPayResult.paid;
      if (paid == false) return SkipcashPayResult.failed;
      return SkipcashPayResult.cancelled;
    } catch (err) {
      final text = err.toString();
      if (text.contains('SKIPCASH_DISABLED') ||
          text.toLowerCase().contains('not available')) {
        return SkipcashPayResult.unavailable;
      }
      return SkipcashPayResult.failed;
    }
  }
}
