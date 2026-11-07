import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/widgets.dart';

import '../helper/app_context.dart';
import '../helper/cache_helper.dart';
import '../routing/routes.dart';
import 'dio_helper.dart';
import 'end_points.dart';

/// Customer session lifetime (scenarios 12, 13, 14).
///
/// * The API issues 7-day tokens and a sliding refresh
///   (`POST /api/customers/token/refresh`) that also accepts a recently
///   expired token. We refresh on launch and on resume when fewer than
///   [refreshWindow] remain, and once more when a request comes back 401.
/// * [hasLiveSession] remembers that the last session fetch showed a live
///   SOS/job, so a failed refresh sends the customer to Login and — after
///   signing in — back through splash to the job, never to an empty Home.
class AuthSession {
  AuthSession._();

  static const Duration refreshWindow = Duration(days: 3);
  static const String _liveSessionKey = 'session_live_kind';

  static bool _inactiveShown = false;
  static bool _updateShown = false;

  /// Blocked or deleted account (403 ACCOUNT_INACTIVE from REST, socket
  /// handshake or an admin block): one "contact support" screen, however
  /// many requests fail at once.
  static void openAccountInactive() {
    if (_inactiveShown) return;
    final nav = AppContext.navigatorKey.currentState;
    if (nav == null) return;
    _inactiveShown = true;
    nav.pushNamedAndRemoveUntil(Routes.accountInactive, (_) => false);
  }

  /// Server answered 426 / splash found this build below the minimum.
  static void openForceUpdate() {
    if (_updateShown) return;
    final nav = AppContext.navigatorKey.currentState;
    if (nav == null) return;
    _updateShown = true;
    nav.pushNamedAndRemoveUntil(Routes.forceUpdate, (_) => false);
  }

  /// Called when the customer leaves the blocked screen (sign out / retry).
  static void resetGuards() {
    _inactiveShown = false;
    _updateShown = false;
  }

  static Completer<bool>? _inFlight;

  static DateTime? tokenExpiry(String? token) {
    if (token == null || token.isEmpty) return null;
    final parts = token.split('.');
    if (parts.length != 3) return null;
    try {
      final payload = jsonDecode(
        utf8.decode(base64Url.decode(base64Url.normalize(parts[1]))),
      );
      final exp = payload is Map ? payload['exp'] : null;
      if (exp is num) {
        return DateTime.fromMillisecondsSinceEpoch(exp.toInt() * 1000);
      }
    } catch (_) {}
    return null;
  }

  static bool get _needsRefresh {
    final exp = tokenExpiry(CacheHelper.getAuthToken());
    if (exp == null) return false;
    return exp.difference(DateTime.now()) < refreshWindow;
  }

  /// Refreshes the token when close to expiry (or always with [force]).
  /// Returns true when a usable token is in place afterwards.
  static Future<bool> refreshIfNeeded({bool force = false}) async {
    final token = CacheHelper.getAuthToken();
    if (token == null || token.isEmpty) return false;
    if (!force && !_needsRefresh) return true;
    final pending = _inFlight;
    if (pending != null) return pending.future;

    final completer = Completer<bool>();
    _inFlight = completer;
    var ok = false;
    try {
      final res = await DioHelper.dio
          .post(
            EndPoints.refreshToken,
            options: Options(headers: {'Authorization': 'Bearer $token'}),
          )
          .timeout(const Duration(seconds: 15));
      final data = res.data;
      if (res.statusCode == 200 && data is Map && data['token'] is String) {
        await CacheHelper.secureWrite(CacheHelper.authTokenKey, data['token'] as String);
        ok = true;
      } else if (res.statusCode == 403 &&
          data is Map &&
          data['code']?.toString() == 'ACCOUNT_INACTIVE') {
        openAccountInactive();
      }
    } catch (_) {
      // Offline: keep the current token; the next request will tell.
      ok = !force;
    } finally {
      _inFlight = null;
      completer.complete(ok);
    }
    return ok;
  }

  /// Remember whether the last session fetch showed live work.
  static Future<void> rememberSession(Map<String, dynamic>? session) async {
    try {
      final kind = session?['session_kind']?.toString();
      if (kind == null || kind.isEmpty || kind == 'null') {
        await CacheHelper.remove(_liveSessionKey);
      } else {
        await CacheHelper.save(_liveSessionKey, kind);
      }
    } catch (_) {}
  }

  static bool get hasLiveSession {
    try {
      final v = CacheHelper.get(_liveSessionKey);
      return v is String && v.isNotEmpty;
    } catch (_) {
      return false;
    }
  }
}

/// Refreshes the token whenever the app returns to the foreground.
class AuthLifecycleObserver with WidgetsBindingObserver {
  AuthLifecycleObserver._();
  static final AuthLifecycleObserver instance = AuthLifecycleObserver._();
  bool _attached = false;

  void attach() {
    if (_attached) return;
    _attached = true;
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      AuthSession.refreshIfNeeded();
    }
  }
}
