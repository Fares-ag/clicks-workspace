import 'package:clicks_user/core/helper/app_context.dart';
import 'package:clicks_user/core/helper/cache_helper.dart';
import 'package:clicks_user/core/helper/extensions.dart';
import 'package:clicks_user/core/routing/routes.dart';
import 'package:clicks_user/core/services/session_resume.dart';
import 'package:clicks_user/core/services/session_sync.dart';
import 'package:clicks_user/core/sos_services/customer_socket_service.dart';
import 'package:flutter/foundation.dart' show kDebugMode;
import 'package:flutter/material.dart';

void _log(String msg) {
  if (kDebugMode) {
    // ignore: avoid_print
    print('[CustomerNotif] $msg');
  }
}

/// Routes the customer after tapping a push (any app state) or an inbox row
/// (scenario 72): by the CURRENT state of the job / SOS the notification is
/// about, never by the event name alone — a "technician arrived" tapped an
/// hour later must open the finished job, and a `sosInCall` tap for an SOS
/// that was cancelled since must not open the in-call screen.
class CustomerNotificationRouter {
  CustomerNotificationRouter._();

  static bool _busy = false;

  static Future<void> handleTap(Map<String, dynamic> data) async {
    final event = data['event']?.toString() ?? data['type']?.toString() ?? '';
    final jobId = data['job_id']?.toString() ?? '';
    final sosId = data['sos_id']?.toString() ?? '';
    _log('handleTap event=$event job=$jobId sos=$sosId');

    if (CacheHelper.getAuthToken() == null) {
      _log('no auth token — skip navigation');
      return;
    }
    if (_busy) return;
    _busy = true;
    try {
      final context = await _waitForNavigator();
      if (context == null || !context.mounted) {
        _log('navigator not ready');
        return;
      }

      if (data['kind']?.toString() == 'support_ticket' ||
          event.startsWith('supportTicket')) {
        context.toNamed(Routes.myRequests);
        return;
      }

      final session = await SessionService.getCustomerSession();
      if (!context.mounted) return;

      // The session already describes the tapped job/SOS: route from it.
      if (_sessionCovers(session, jobId: jobId, sosId: sosId) ||
          (jobId.isEmpty && sosId.isEmpty)) {
        await SessionResume.go(context, session, replace: true);
        return;
      }

      // A different job (two cars) or a finished one: fetch it by id and
      // route by its own status.
      if (jobId.isNotEmpty) {
        final res = await SessionService.getJob(jobId);
        final job = res?['job'];
        if (!context.mounted) return;
        if (job is Map) {
          final asSession =
              sessionForJob(Map<String, dynamic>.from(job), res?['cancel_policy']);
          if (asSession == null) {
            // Finished (paid or cancelled): open that job's details.
            context.toNamed(
              Routes.activityDetails,
              arguments: SessionResume.jobDtoFromSession(job),
            );
          } else {
            await SessionResume.go(context, asSession, replace: true);
          }
          return;
        }
      }

      // SOS no longer active (claimed into a job, cancelled, closed): the
      // session decides — never open in-call for a dead SOS.
      await SessionResume.go(context, session, replace: true);
    } catch (e) {
      _log('tap routing failed: $e');
      final context = AppContext.navigatorKey.currentContext;
      if (context != null && context.mounted) context.offNamed(Routes.home);
    } finally {
      _busy = false;
    }
  }

  /// A session-shaped map for one job, so [SessionResume] routes it by its
  /// own status: live → its live screen, completed-unpaid → payment.
  /// Null when the job is finished (paid, or cancelled): show its details.
  static Map<String, dynamic>? sessionForJob(
    Map<String, dynamic> job, [
    dynamic cancelPolicy,
  ]) {
    final status = job['job_status']?.toString() ?? '';
    final paid = const {'paid', 'partially_refunded', 'refunded'}
        .contains(job['payment_status']?.toString());
    if (status == 'completed' && !paid) {
      return {'session_kind': 'unpaid', 'unpaid_job': job, 'active_job': job};
    }
    if (status == 'completed' || status == 'cancelled') return null;
    return {
      'session_kind': status,
      'live_job': job,
      'active_job': job,
      if (cancelPolicy is Map) 'cancel_policy': cancelPolicy,
    };
  }

  static bool _sessionCovers(
    Map<String, dynamic> session, {
    required String jobId,
    required String sosId,
  }) {
    String idOf(dynamic m) =>
        m is Map ? (m['_id'] ?? m['id'] ?? '').toString() : '';
    if (jobId.isNotEmpty) {
      return idOf(session['live_job']) == jobId ||
          idOf(session['unpaid_job']) == jobId;
    }
    if (sosId.isNotEmpty) {
      final sos = session['active_sos'];
      if (idOf(sos) == sosId) return true;
      final live = session['live_job'];
      return live is Map && live['sos_request_id']?.toString() == sosId;
    }
    return false;
  }

  /// A cold-start tap fires before the first frame / splash: wait for the
  /// navigator, then (≤ 10 s) for splash to finish its own session routing —
  /// signalled by a session screen or Home registering — so splash does not
  /// replace the screen this tap opens.
  static Future<BuildContext?> _waitForNavigator() async {
    for (var i = 0; i < 50; i++) {
      final context = AppContext.navigatorKey.currentContext;
      if (context != null && context.mounted && ActiveSessionScreen.route != null) {
        return context;
      }
      await Future<void>.delayed(const Duration(milliseconds: 200));
    }
    final context = AppContext.navigatorKey.currentContext;
    return context != null && context.mounted ? context : null;
  }
}
