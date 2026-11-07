import 'package:dio/dio.dart';
import 'package:easy_localization/easy_localization.dart';

/// Server error code → translated message (scenario 20).
///
/// Every API error carries a stable `code`; the app maps it to an en/ar key
/// under `errors.<CODE>` in assets/translations. A raw server `error`
/// string is never shown — unknown codes fall back to [fallbackKey]
/// (a translation key), so an Arabic-speaking customer never sees English
/// at the worst moment.
String errorMessageForCode(String? code, {String fallbackKey = 'errors.generic'}) {
  final legacy = _legacyKeys[code];
  if (legacy != null) return legacy.tr();
  if (code != null && code.isNotEmpty) {
    final key = 'errors.$code';
    final translated = key.tr();
    if (translated != key) return translated;
  }
  return fallbackKey.tr();
}

/// Message for a failed response: its `code`, else a status-based message.
String errorMessageForResponse(Response response, {String fallbackKey = 'errors.generic'}) {
  final data = response.data;
  final code = data is Map ? data['code']?.toString() : null;
  if (code != null && code.isNotEmpty) {
    return errorMessageForCode(code, fallbackKey: fallbackKey);
  }
  final status = response.statusCode ?? 0;
  if (status == 429) return 'errors.RATE_LIMITED'.tr();
  if (status >= 500) return 'errors.server_unavailable'.tr();
  return fallbackKey.tr();
}

/// Message for a thrown error (network, timeout, …).
String errorMessageForException(Object error, {String fallbackKey = 'errors.generic'}) {
  if (error is DioException) {
    final response = error.response;
    if (response != null) return errorMessageForResponse(response, fallbackKey: fallbackKey);
    return 'errors.network'.tr();
  }
  return fallbackKey.tr();
}

/// Codes that predate the `errors.*` section and already have copy.
const Map<String, String> _legacyKeys = {
  'LIVE_JOB_ACTIVE': 'home.live_job_active',
  'LIVE_JOB_VEHICLE_ACTIVE': 'home.live_job_vehicle_active',
  'UNPAID_JOB_HOLD': 'home.payment_needed_body',
  'OUTSIDE_COVERAGE': 'home.outside_coverage',
  'DISPATCH_WINDOW': 'home.dispatch_window',
  'JOB_NOT_CANCELLABLE': 'home.job_not_cancellable',
  'LAUNCH_PUBLIC_SOS_OFF': 'home.sos_unavailable',
};

/// Booking / SOS / cancel errors. Kept for existing callers; [fallback] (a
/// raw server string) is no longer shown — unknown codes get the generic
/// cancel message as before.
String bookingErrorMessage(String? code, [String? fallback]) {
  return errorMessageForCode(code, fallbackKey: 'home.cancel_failed');
}
