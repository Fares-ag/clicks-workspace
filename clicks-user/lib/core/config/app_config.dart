/// App-level configuration read from compile-time environment variables.
///
/// ### Quick usage (recommended):
/// ```bash
/// # Staging (default)
/// flutter build apk --dart-define=ENV=staging
///
/// # Production
/// flutter build apk --dart-define=ENV=production
/// ```
///
/// ### Advanced – override individual URLs:
/// ```bash
/// flutter run \
///   --dart-define=API_BASE_URL=https://custom-api.example.com \
///   --dart-define=SOCKET_URL=https://custom-socket.example.com
/// ```
class AppConfig {
  AppConfig._();

  /// Build environment: 'staging' or 'production'
  static const String env = String.fromEnvironment(
    'ENV',
    defaultValue: 'staging',
  );

  static bool get isProduction => env == 'production';

  // ── Per-environment base URLs ──
  static const String _stagingApi = 'https://stg-tech-api.clicks.qa';
  // Same host as technician app — tech-api.clicks.qa is not DNS-configured yet.
  static const String _productionApi =
      'https://clicks-tech-api-production.up.railway.app';

  /// Backend base URL – auto-selected from ENV, or override with --dart-define
  static const String _apiOverride = String.fromEnvironment('API_BASE_URL');
  static String get apiBaseUrl =>
      _apiOverride.isNotEmpty ? _apiOverride : (isProduction ? _productionApi : _stagingApi);

  /// WebSocket URL (defaults to same as API base)
  static const String _socketOverride = String.fromEnvironment('SOCKET_URL');
  static String get socketUrl =>
      _socketOverride.isNotEmpty ? _socketOverride : apiBaseUrl;

  /// Google Maps API key (passed via --dart-define=GOOGLE_MAPS_API_KEY=...)
  static const String googleMapsApiKey = String.fromEnvironment(
    'GOOGLE_MAPS_API_KEY',
    defaultValue: '',
  );
}
