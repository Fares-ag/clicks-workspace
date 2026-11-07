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
  static const String dashboardEarnings = '/dashboard/earnings';
  static const String dashboardJobCompletion = '/dashboard/job-completion';
  static const String dashboardTechnicianPerformance =
      '/dashboard/technician-performance';
  static const String dashboardEarningsByDate = '/dashboard/earnings-by-date';

  // Ops
  static const String sos = '/sos';
  static const String serviceRequests = '/service-requests';
  static const String jobs = '/jobs';
  static String jobHold(String id) => '/jobs/$id/hold';
  static String jobResume(String id) => '/jobs/$id/resume';
  static String jobGarage(String id) => '/jobs/$id/garage';
  static String jobGarageReady(String id) => '/jobs/$id/garage/ready';
  static String jobComplete(String id) => '/jobs/$id/complete';
  static String jobHoldRequestApprove(String id) => '/jobs/$id/hold-request/approve';
  static String jobHoldRequestReject(String id) => '/jobs/$id/hold-request/reject';
  static String jobReassign(String id) => '/jobs/$id/reassign';
  static String jobRepairs(String id) => '/jobs/$id/repairs';
  static String jobReceipt(String id) => '/receipts/job/$id';
  static String jobReceiptDownload(String id) => '/receipts/job/$id/download';
  static const String jobsImport = '/jobs/import';
  static const String jobsHeatmap = '/jobs/heatmap';
  static const String jobsNearby = '/jobs/nearby';
  static const String leads = '/leads';
  static const String technicians = '/technicians';
  static const String techniciansLiveMap = '/technicians/live-map';

  // Phase 2
  static const String vehicles = '/vehicles';
  static const String customers = '/customers';
  static const String businesses = '/businesses';
  static const String partners = '/partners';
  static const String financeOverviewSummary = '/finance-overview/summary';
  static const String financeOverviewJobs = '/finance-overview/jobs';
  static const String technicianActivity = '/technician-activity';
  static const String technicianActivityFilters = '/technician-activity/filters';
  static const String technicianActivityExport = '/technician-activity/export';
  static const String financeUsers = '/finance-users';
  static const String admins = '/admins';
  static const String performance = '/performance';
  static const String sources = '/sources';
  static const String vehicleMakes = '/vehicle-makes';
  static const String vehicleModels = '/vehicle-models';
  static const String subscriptionPlans = '/subscription-plans';
  static const String customerSubscriptions = '/customer-subscriptions';
}
