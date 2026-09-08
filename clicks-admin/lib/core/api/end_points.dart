import '../config/app_config.dart';

class EndPoints {
  static String get baseUrl => '${AppConfig.apiBaseUrl}/api';

  // Auth
  static const String login = '/auth/login';
  static const String refreshToken = '/auth/refresh-token';
  static const String me = '/auth/me';
  static const String fcmToken = '/auth/fcm-token';
  static const String forgotPassword = '/auth/forgot-password';

  // Dashboard
  static const String dashboardSummary = '/dashboard/summary';

  // Ops
  static const String sos = '/sos';
  static const String serviceRequests = '/service-requests';
  static const String jobs = '/jobs';
  static String jobHold(String id) => '/jobs/$id/hold';
  static String jobResume(String id) => '/jobs/$id/resume';
  static String jobComplete(String id) => '/jobs/$id/complete';
  static String jobHoldRequestApprove(String id) => '/jobs/$id/hold-request/approve';
  static String jobHoldRequestReject(String id) => '/jobs/$id/hold-request/reject';
  static const String leads = '/leads';
  static const String technicians = '/technicians';
  static const String techniciansLiveMap = '/technicians/live-map';

  // Phase 2
  static const String vehicles = '/vehicles';
  static const String customers = '/customers';
  static const String businesses = '/businesses';
  static const String partners = '/partners';
  static const String financeOverview = '/finance-overview';
  static const String financeUsers = '/finance-users';
  static const String admins = '/admins';
  static const String performance = '/performance';
  static const String sources = '/sources';
  static const String vehicleMakes = '/vehicle-makes';
  static const String vehicleModels = '/vehicle-models';
}
