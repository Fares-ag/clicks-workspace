import 'package:flutter/foundation.dart' show kIsWeb, kReleaseMode;

/// Admin mobile app — same backends as [clicks-interface] (web admin).
///
/// Production (live Railway — same backends QA scripts use):
/// - REST: https://clicks-admin-api-production.up.railway.app/api
/// - Socket: https://clicks-tech-api-production.up.railway.app/admin
///
/// Custom domains (`admin-api.clicks.qa`) can be used via `--dart-define=API_BASE_URL=...`
/// when DNS is configured.
///
/// Staging (matches STAGING_DEPLOY.md):
/// - REST: https://stg-admin-api.clicks.qa/api
/// - Socket: https://stg-tech-api.clicks.qa/admin
class AppConfig {
  AppConfig._();

  static const String _envRaw = String.fromEnvironment('ENV');

  static String get env => _envRaw.isEmpty ? 'staging' : _envRaw;

  static bool get isProduction => env == 'production';

  // Production — same hosts as clicks-interface VERCEL.md
  static const String _productionAdminApi =
      'https://clicks-admin-api-production.up.railway.app';
  static const String _productionTechApi =
      'https://clicks-tech-api-production.up.railway.app';

  // Staging — same hosts as clicks-interface / STAGING_DEPLOY.md
  static const String _stagingAdminApi = 'https://stg-admin-api.clicks.qa';
  static const String _stagingTechApi = 'https://stg-tech-api.clicks.qa';

  // Local admin-api when running backends on the machine (LOCAL_TEST.md)
  static const String _localAdminApi = 'http://localhost:5000';
  static const String _localTechApi = 'http://localhost:5001';

  static const String _apiOverride = String.fromEnvironment('API_BASE_URL');
  static const String _socketOverride = String.fromEnvironment('SOCKET_URL');

  static String get apiBaseUrl {
    validateReleaseConfig();
    return _resolveAdminApi();
  }

  static String get socketUrl {
    validateReleaseConfig();
    if (_socketOverride.isNotEmpty) return _socketOverride;
    if (_apiOverride.isNotEmpty && _usesLocalHost(_apiOverride)) {
      return _localTechApi;
    }
    return isProduction ? _productionTechApi : _stagingTechApi;
  }

  static void validateReleaseConfig() {
    if (!kReleaseMode) return;

    if (_envRaw.isEmpty) {
      throw StateError(
        'Release build requires --dart-define=ENV=production. '
        'Example: flutter build apk --release --dart-define=ENV=production',
      );
    }

    _assertReleaseSafeUrl(_resolveAdminApi());
    if (_socketOverride.isNotEmpty) {
      _assertReleaseSafeUrl(_socketOverride);
    }
  }

  static String _resolveAdminApi() {
    if (_apiOverride.isNotEmpty) return _normalizeBase(_apiOverride);
    if (isProduction) return _productionAdminApi;
    // Staging cloud default — same stack the web admin uses on staging.
    return _stagingAdminApi;
  }

  static String _normalizeBase(String url) {
    var trimmed = url.trim();
    while (trimmed.endsWith('/')) {
      trimmed = trimmed.substring(0, trimmed.length - 1);
    }
    if (trimmed.endsWith('/api')) {
      return trimmed.substring(0, trimmed.length - 4);
    }
    return trimmed;
  }

  static bool _usesLocalHost(String url) {
    final host = Uri.tryParse(url)?.host.toLowerCase() ?? '';
    return _isLocalHost(host);
  }

  static void _assertReleaseSafeUrl(String url) {
    final uri = Uri.tryParse(url);
    if (uri == null || uri.host.isEmpty) {
      throw StateError('Invalid URL: $url');
    }

    final host = uri.host.toLowerCase();
    if (_isLocalHost(host)) {
      throw StateError(
        'Release build cannot use a local/emulator API URL ($url).',
      );
    }

    if (uri.scheme != 'https') {
      throw StateError('Release build requires HTTPS ($url).');
    }
  }

  static bool _isLocalHost(String host) {
    return host == 'localhost' ||
        host == '127.0.0.1' ||
        host == '10.0.2.2' ||
        host == '0.0.0.0' ||
        host.endsWith('.local');
  }

  /// Override staging with local backends: `--dart-define=API_BASE_URL=http://localhost:5000`
  static String get localAdminApiHint =>
      kIsWeb ? _localAdminApi : 'http://10.0.2.2:5000';

  static const String googleMapsApiKey = String.fromEnvironment(
    'GOOGLE_MAPS_API_KEY',
    defaultValue: '',
  );

  static const String sentryDsn = String.fromEnvironment(
    'SENTRY_DSN',
    defaultValue: '',
  );

  static const String appVersion = '1.0.0+1';
}
