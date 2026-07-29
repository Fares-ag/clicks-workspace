/// Compile-time config. Business portal hits **admin-api** (`/api/business/*`).
class AppConfig {
  AppConfig._();

  static const String env = String.fromEnvironment(
    'ENV',
    defaultValue: 'staging',
  );

  static bool get isProduction => env == 'production';

  // Local admin-api for staging builds; override with --dart-define=API_BASE_URL=...
  static const String _stagingApi = 'http://10.0.2.2:5000';
  static const String _productionApi =
      'https://clicks-admin-api-production.up.railway.app';

  static const String _apiOverride = String.fromEnvironment('API_BASE_URL');
  static String get apiBaseUrl => _apiOverride.isNotEmpty
      ? _apiOverride
      : (isProduction ? _productionApi : _stagingApi);
}
