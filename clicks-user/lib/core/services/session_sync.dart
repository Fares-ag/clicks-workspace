import 'dart:async';

import 'package:clicks_user/core/helper/app_context.dart';
import 'package:clicks_user/core/helper/cache_helper.dart';
import 'package:clicks_user/core/routing/routes.dart';
import 'package:clicks_user/core/services/session_resume.dart';
import 'package:clicks_user/core/sos_services/customer_socket_service.dart';
import 'package:clicks_user/features/home/rating_bottom_sheet.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/foundation.dart' show kDebugMode;
import 'package:flutter/material.dart';

void _log(String msg) {
  if (kDebugMode) {
    // ignore: avoid_print
    print('[SessionSync] $msg');
  }
}

/// Which session screen is on top right now (tracking for job X, the SOS
/// timer, Home...). Screens register in initState and leave in dispose.
///
/// Used to decide whether a resync must navigate (scenario 58), and whether a
/// foreground push for a job is redundant because that job is on screen (73).
class ActiveSessionScreen {
  ActiveSessionScreen._();

  static String? _route;
  static String? _id;
  static bool Function()? _isCurrent;

  static String? get route => _route;
  static String? get id => _id;
  static String? get key =>
      _route == null ? null : SessionTarget.keyFor(_route!, _id);

  /// False when another route (notifications, checkout...) is pushed over the
  /// registered screen — a resync must not yank the customer off it.
  static bool get isOnTop => _route != null && (_isCurrent?.call() ?? true);

  /// [isCurrent] is usually `() => ModalRoute.of(context)?.isCurrent ?? true`.
  static void enter(String route, [String? id, bool Function()? isCurrent]) {
    _route = route;
    _id = (id == null || id.isEmpty) ? null : id;
    _isCurrent = isCurrent;
  }

  /// Update the id once the screen learns it (e.g. the SOS id after create).
  static void updateId(String route, String? id) {
    if (_route == route) _id = (id == null || id.isEmpty) ? null : id;
  }

  /// Only clears when the leaving screen is still the registered one (a
  /// replacement route's initState runs before the old one's dispose).
  static void leave(String route, [String? id]) {
    final normalized = (id == null || id.isEmpty) ? null : id;
    if (_route == route && _id == normalized) {
      _route = null;
      _id = null;
      _isCurrent = null;
    }
  }

  /// True when the visible screen is about this job or SOS.
  static bool shows({String? jobId, String? sosId}) {
    if (_id == null) return false;
    return (jobId != null && jobId.isNotEmpty && jobId == _id) ||
        (sosId != null && sosId.isNotEmpty && sosId == _id);
  }
}

/// Re-fetches `/api/jobs/customer/session` whenever realtime may have missed
/// something — the socket came back after a drop, or the app returned to the
/// foreground — and routes through [SessionResume] when the screen shown is
/// no longer the right one (scenarios 58, 65). Screens that ARE right get the
/// fresh session through [updates] and refresh themselves.
class SessionSync with WidgetsBindingObserver {
  SessionSync._();
  static final SessionSync instance = SessionSync._();

  final StreamController<Map<String, dynamic>> _updates =
      StreamController<Map<String, dynamic>>.broadcast();

  /// Every fresh session payload fetched by a resync.
  Stream<Map<String, dynamic>> get updates => _updates.stream;

  StreamSubscription<void>? _reconnectSub;
  bool _attached = false;
  bool _running = false;
  DateTime _lastRun = DateTime.fromMillisecondsSinceEpoch(0);
  final Set<String> _ratingPromptedThisRun = <String>{};
  String? _lastTargetKey;

  /// Home opened: ask once about a paid, unrated job (no navigation).
  Future<void> promptRatingFromHome() async {
    if (CacheHelper.getAuthToken() == null) return;
    try {
      final session = await SessionService.getCustomerSession();
      _lastTargetKey = SessionResume.resolve(session).key;
      final context = AppContext.navigatorKey.currentContext;
      if (context == null || !context.mounted) return;
      if (ActiveSessionScreen.route != Routes.home || !ActiveSessionScreen.isOnTop) {
        return;
      }
      await promptRatingOnce(context, session);
    } catch (e) {
      _log('home rating check failed: $e');
    }
  }

  static const Duration _minGap = Duration(seconds: 3);

  void attach(CustomerSocketService socket) {
    if (!_attached) {
      _attached = true;
      WidgetsBinding.instance.addObserver(this);
    }
    _reconnectSub ??= socket.reconnects.listen((_) => resync(reason: 'reconnect'));
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      resync(reason: 'resume');
    }
  }

  /// Screens that only care whether a navigation is due (and session-free
  /// screens such as checkout) are never yanked: a resync navigates only
  /// from a registered session screen or Home.
  Future<void> resync({String reason = 'manual', bool force = false}) async {
    if (CacheHelper.getAuthToken() == null) return;
    final now = DateTime.now();
    if (_running || (!force && now.difference(_lastRun) < _minGap)) return;
    if (!ActiveSessionScreen.isOnTop) {
      _log('skip ($reason): no session screen on top');
      return;
    }
    _running = true;
    _lastRun = now;
    try {
      final session = await SessionService.getCustomerSession();
      _updates.add(session);
      final target = SessionResume.resolve(session);
      final context = AppContext.navigatorKey.currentContext;
      if (context == null || !context.mounted) return;
      final latest = ActiveSessionScreen.key;
      if (latest == null || !ActiveSessionScreen.isOnTop) return;
      // A screen that has not learned its id yet counts as the same screen
      // when the route matches (no re-push loop).
      final sameScreen = target.key == latest ||
          (ActiveSessionScreen.id == null &&
              target.route == ActiveSessionScreen.route);
      // From Home, only a CHANGE pulls the customer in: one who closed the
      // tracking screen on purpose is not bounced back on every resume.
      final previous = _lastTargetKey;
      _lastTargetKey = target.key;
      final fromHomeUnchanged =
          ActiveSessionScreen.route == Routes.home && previous == target.key;
      if (!sameScreen && !fromHomeUnchanged) {
        _log('$reason: $latest -> ${target.key}');
        await SessionResume.go(context, session, replace: true);
        return;
      }
      if (target.route == Routes.home && target.ratingPromptJobId != null) {
        await promptRatingOnce(context, session);
      }
    } catch (e) {
      // Transient network/DB trouble: keep the current screen (never route
      // to Home on an error — scenario 67).
      _log('$reason failed: $e');
    } finally {
      _running = false;
    }
  }

  /// Scenario 76: on resume, a paid job the customer has not rated is asked
  /// about ONCE — the server records rating_prompted_at before the sheet
  /// opens, so a dismissed prompt is never shown again.
  Future<void> promptRatingOnce(
    BuildContext context,
    Map<String, dynamic> session,
  ) async {
    final job = session['rating_prompt_job'];
    if (job is! Map) return;
    final jobId = job['_id']?.toString() ?? job['id']?.toString() ?? '';
    if (jobId.isEmpty || !_ratingPromptedThisRun.add(jobId)) return;
    await SessionService.markRatingPrompted(jobId);
    if (!context.mounted) return;
    final tech = SessionResume.techInfoFromJob(job);
    final name = (tech['name'] ?? '').toString();
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) => RatingBottomSheet(
        technicianName: name.isEmpty ? 'job_progress.technician'.tr() : name,
        technicianPhotoUrl: (tech['photo'] ?? '').toString(),
        jobId: jobId,
        onSubmitted: () => Navigator.of(sheetContext).pop(),
        onSkipped: () => Navigator.of(sheetContext).pop(),
      ),
    );
  }
}
