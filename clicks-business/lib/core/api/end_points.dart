import '../config/app_config.dart';

class EndPoints {
  static String get baseUrl => AppConfig.apiBaseUrl;

  static const String login = '/api/business/auth/login';
  static const String me = '/api/business/me';
  static const String dashboard = '/api/business/dashboard';
  static const String analytics = '/api/business/analytics';
  static const String jobs = '/api/business/jobs';
  static String jobById(String id) => '/api/business/jobs/$id';

  static const String vehicleMakes = '/api/business/vehicle-makes';
  static String vehicleModelsByMake(String makeId) =>
      '/api/business/vehicle-models/by-make/$makeId';
}
