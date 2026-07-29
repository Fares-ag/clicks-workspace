import '../config/app_config.dart';

class EndPoints {
  static String get baseUrl => AppConfig.apiBaseUrl;

  static const String login = '/api/partner/login';
  static const String me = '/api/partner/me';
  static const String changePassword = '/api/partner/change-password';
  static const String dashboard = '/api/partner/dashboard';
  static const String earnings = '/api/partner/earnings';
  static const String withdrawals = '/api/partner/withdrawals';
  static const String fcmToken = '/api/partner/fcm-token';
}
