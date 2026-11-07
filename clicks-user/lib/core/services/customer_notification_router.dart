import 'package:clicks_user/core/helper/app_context.dart';
import 'package:clicks_user/core/helper/cache_helper.dart';
import 'package:clicks_user/core/helper/extensions.dart';
import 'package:clicks_user/core/routing/routes.dart';
import 'package:clicks_user/core/services/session_resume.dart';
import 'package:clicks_user/core/sos_services/customer_socket_service.dart';
import 'package:flutter/foundation.dart' show kDebugMode;
import 'package:flutter/material.dart';

void _log(String msg) {
  if (kDebugMode) {
    // ignore: avoid_print
    print('[CustomerNotif] $msg');
  }
}

/// Routes the user to the correct screen after tapping a push notification.
class CustomerNotificationRouter {
  CustomerNotificationRouter._();

  static Future<void> handleTap(Map<String, dynamic> data) async {
    final event =
        data['event']?.toString() ?? data['type']?.toString() ?? '';
    _log('handleTap event=$event job=${data['job_id']}');

    if (CacheHelper.getAuthToken() == null) {
      _log('no auth token — skip navigation');
      return;
    }

    final context = AppContext.navigatorKey.currentContext;
    if (context == null || !context.mounted) {
      _log('navigator not ready');
      return;
    }

    if (event == 'sosInCall') {
      context.offNamed(Routes.inCall);
      return;
    }

    try {
      final session = await SessionService.getCustomerSession();
      if (!context.mounted) return;
      await _navigateFromSession(context, session, preferredEvent: event);
    } catch (e) {
      _log('session resume failed: $e');
      if (context.mounted) {
        context.offNamed(Routes.home);
      }
    }
  }

  static Future<void> _navigateFromSession(
    BuildContext context,
    Map<String, dynamic> session, {
    String? preferredEvent,
  }) async {
    await SessionResume.go(
      context,
      session,
      preferredEvent: preferredEvent,
      replace: true,
    );
  }
}
