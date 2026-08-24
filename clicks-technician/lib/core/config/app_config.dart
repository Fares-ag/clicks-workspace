import 'package:flutter/foundation.dart' show kReleaseMode;

/// App-level configuration read from compile-time environment variables.
///
/// ### Quick usage (recommended):
/// ```bash
/// # Staging (default)
/// flutter run --dart-define=ENV=staging
///
/// # Production
/// flutter run --dart-define=ENV=production
/// ```
///
/// ### Advanced – override individual URLs (e.g. local backend):
/// ```bash
/// flutter run -d chrome --web-port=8081 \
///   --dart-define=API_BASE_URL=http://localhost:5001 \
///   --dart-define=SOCKET_URL=http://localhost:5001
/// ```
class AppConfig {
  AppConfig._();

  /// Empty when `ENV` was not passed via `--dart-define` (debug defaults to staging).
  static const String _envRaw = String.fromEnvironment('ENV');

  /// Build environment: 'staging' or 'production'
  static String get env => _envRaw.isEmpty ? 'staging' : _envRaw;

  static bool get isProduction => env == 'production';

  // ── Per-environment base URLs ──
  static const String _stagingApi = 'https://stg-tech-api.clicks.qa';
  static const String _productionApi =
      'https://clicks-tech-api-production.up.railway.app';

  /// Backend base URL – auto-selected from ENV, or override with --dart-define
  static const String _apiOverride = String.fromEnvironment('API_BASE_URL');

  static String get apiBaseUrl {
    validateReleaseConfig();
    return _resolveApiBaseUrl();
  }

  /// Fail-closed guard for release builds — call from [main] before networking.
  /// Without it a release built without `--dart-define=ENV=production` silently
  /// ships pointing at the staging backend.
  static void validateReleaseConfig() {
    if (!kReleaseMode) return;

    if (_envRaw.isEmpty) {
      throw StateError(
        'Release build requires --dart-define=ENV=production. '
        'Example: flutter build appbundle --release --dart-define=ENV=production',
      );
    }

    _assertReleaseSafeUrl(_resolveApiBaseUrl());
  }

  static String _resolveApiBaseUrl() {
    if (_apiOverride.isNotEmpty) return _apiOverride;
    return isProduction ? _productionApi : _stagingApi;
  }

  static void _assertReleaseSafeUrl(String url) {
    final uri = Uri.tryParse(url);
    if (uri == null || uri.host.isEmpty) {
      throw StateError('Invalid API_BASE_URL: $url');
    }

    final host = uri.host.toLowerCase();
    if (_isLocalHost(host)) {
      throw StateError(
        'Release build cannot use a local/emulator API URL ($url). '
        'Use --dart-define=ENV=production.',
      );
    }

    if (uri.scheme != 'https') {
      throw StateError(
        'Release build requires HTTPS for API_BASE_URL ($url).',
      );
    }
  }

  static bool _isLocalHost(String host) {
    return host == 'localhost' ||
        host == '127.0.0.1' ||
        host == '10.0.2.2' ||
        host == '0.0.0.0' ||
        host.endsWith('.local');
  }

  /// WebSocket URL (defaults to same as API base)
  static const String _socketOverride = String.fromEnvironment('SOCKET_URL');
  static String get socketUrl =>
      _socketOverride.isNotEmpty ? _socketOverride : apiBaseUrl;

  /// Google Maps API key (same key as admin `VITE_GOOGLE_MAPS_API_KEY`).
  /// Pass via `--dart-define=GOOGLE_MAPS_API_KEY=...` — do not hardcode.
  static const String googleMapsApiKey = String.fromEnvironment(
    'GOOGLE_MAPS_API_KEY',
    defaultValue: '',
  );

  /// Sentry DSN — empty disables crash reporting entirely (default).
  static const String sentryDsn = String.fromEnvironment(
    'SENTRY_DSN',
    defaultValue: '',
  );

  static bool get isSentryEnabled => sentryDsn.isNotEmpty;

  /// Keep aligned with pubspec `version`.
  static const String appVersion = '1.2.3+16';

  static String get sentryRelease => 'clicks_technician@$appVersion';
}
