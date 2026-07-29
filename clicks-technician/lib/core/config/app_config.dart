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

  /// Build environment: 'staging' or 'production'
  static const String env = String.fromEnvironment(
    'ENV',
    defaultValue: 'staging',
  );

  static bool get isProduction => env == 'production';

  // ── Per-environment base URLs ──
  static const String _stagingApi = 'https://stg-tech-api.clicks.qa';
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

  /// Google Maps API key (same key as admin `VITE_GOOGLE_MAPS_API_KEY`).
  /// Pass via `--dart-define=GOOGLE_MAPS_API_KEY=...` — do not hardcode.
  static const String googleMapsApiKey = String.fromEnvironment(
    'GOOGLE_MAPS_API_KEY',
    defaultValue: '',
  );
}
