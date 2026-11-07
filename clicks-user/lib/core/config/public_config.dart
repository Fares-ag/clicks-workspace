import 'package:flutter/foundation.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api/dio_helper.dart';
import '../helper/cache_helper.dart';
import 'app_config.dart';

/// Runtime config served by the API at `GET /api/config/public` (WS-I 2).
///
/// Read once at splash; the last good copy of the support number is cached
/// in SharedPreferences so the "Call us" buttons work offline.
class PublicConfig {
  PublicConfig._();

  static const String endpoint = '/api/config/public';

  /// Fallback when the server has no SUPPORT_PHONE yet (or is unreachable
  /// on first launch). Chosen from the Clicks-branded receipt PDF
  /// ("7091 9191") — confirm with ops before launch.
  static const String fallbackSupportPhone = '+97470919191';

  static const String _supportPhoneCacheKey = 'public_config_support_phone';

  static String? _supportPhone;
  static String? _minVersion;
  static String? _storeUrl;
  static bool? publicSos;
  static bool loaded = false;

  /// The ONE support number every "Call us" button uses (scenario 41).
  static String get supportPhone {
    final live = _supportPhone;
    if (live != null && live.isNotEmpty) return live;
    try {
      final cached = CacheHelper.get(_supportPhoneCacheKey);
      if (cached is String && cached.isNotEmpty) return cached;
    } catch (_) {}
    return fallbackSupportPhone;
  }

  static Uri get supportPhoneUri => Uri.parse('tel:$supportPhone');

  static Future<void> callSupport() async {
    try {
      await launchUrl(supportPhoneUri);
    } catch (_) {}
  }

  /// "ios" / "android" / "web" — sent as X-Platform and used for min version.
  static String get platform {
    if (kIsWeb) return 'web';
    switch (defaultTargetPlatform) {
      case TargetPlatform.iOS:
        return 'ios';
      case TargetPlatform.android:
        return 'android';
      default:
        return defaultTargetPlatform.name.toLowerCase();
    }
  }

  /// Version name without the build number ("1.1.6" from "1.1.6+16").
  static String get appVersionName => AppConfig.appVersion.split('+').first;

  static String? get storeUrl => _storeUrl;

  /// True when this build is below the server's minimum for this platform.
  static bool get updateRequired {
    final min = _minVersion;
    if (min == null || min.isEmpty) return false;
    return compareVersions(appVersionName, min) < 0;
  }

  /// Marks an update as required after the server answered 426.
  static void markUpdateRequired({String? minVersion, String? storeUrl}) {
    _minVersion = minVersion ?? _minVersion ?? '999.0.0';
    if (storeUrl != null && storeUrl.isNotEmpty) _storeUrl = storeUrl;
  }

  /// Fetches the config. Never throws; returns false when unreachable.
  static Future<bool> load() async {
    try {
      final res = await DioHelper.getData(url: endpoint, auth: false)
          .timeout(const Duration(seconds: 8));
      final data = res.data;
      if (res.statusCode != 200 || data is! Map) return false;
      final phone = data['support_phone']?.toString();
      if (phone != null && phone.isNotEmpty) {
        _supportPhone = phone;
        try {
          await CacheHelper.save(_supportPhoneCacheKey, phone);
        } catch (_) {}
      }
      final min = data['min_app_version'];
      if (min is Map) _minVersion = min[platform]?.toString();
      final store = data['store_url'];
      if (store is Map) _storeUrl = store[platform]?.toString();
      final flags = data['flags'];
      if (flags is Map && flags['public_sos'] is bool) {
        publicSos = flags['public_sos'] as bool;
      }
      loaded = true;
      return true;
    } catch (_) {
      return false;
    }
  }

  /// -1 / 0 / 1. Non-numeric parts count as 0.
  static int compareVersions(String a, String b) {
    List<int> parts(String v) => v
        .split('+')
        .first
        .split('.')
        .map((p) => int.tryParse(p.trim()) ?? 0)
        .toList();
    final pa = parts(a);
    final pb = parts(b);
    final len = pa.length > pb.length ? pa.length : pb.length;
    for (var i = 0; i < len; i++) {
      final x = i < pa.length ? pa[i] : 0;
      final y = i < pb.length ? pb[i] : 0;
      if (x != y) return x < y ? -1 : 1;
    }
    return 0;
  }
}
