import 'package:flutter/foundation.dart' show kReleaseMode;

/// Partner app hits **admin-api** (`/api/partner/*`).
class AppConfig {
  AppConfig._();

  /// Empty when `ENV` was not passed via `--dart-define` (debug defaults to staging).
  static const String _envRaw = String.fromEnvironment('ENV');

  static String get env => _envRaw.isEmpty ? 'staging' : _envRaw;

  static bool get isProduction => env == 'production';

  // Local admin-api for emulator; override with --dart-define=API_BASE_URL=...
  static const String _stagingApi = 'http://10.0.2.2:5000';
  static const String _productionApi =
      'https://clicks-admin-api-production.up.railway.app';

  static const String _apiOverride = String.fromEnvironment('API_BASE_URL');

  static String get apiBaseUrl {
    validateReleaseConfig();
    return _resolveApiBaseUrl();
  }

  /// Fail-closed guard for release builds — call from [main] before networking.
  static void validateReleaseConfig() {
    if (!kReleaseMode) return;

    if (_envRaw.isEmpty) {
      throw StateError(
        'Release build requires --dart-define=ENV=production. '
        'Example: flutter build apk --release --dart-define=ENV=production',
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
}
