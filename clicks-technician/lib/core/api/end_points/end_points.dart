import '../../config/app_config.dart';

class EndPoints {
  static String get baseUrl => AppConfig.apiBaseUrl;

  //! Auth
  static const String login = "/api/technicians/login";
  static const String forgotPassword = "/api/technicians/forgot-password";
  static const String verifyResetOtp = "/api/technicians/verify-reset-otp";
  static const String resetPassword = "/api/technicians/reset-password";

  //! Registration / OTP
  static const String register = "/api/technicians/register";
  static const String sendOtp = "/api/technicians/otp/send";
  static const String verifyOtp = "/api/technicians/otp/verify";
  static const String applicationStatus = "/api/technicians/application-status";

  //! Profile / dashboard
  static const String profile = "/api/technicians/profile";
  static const String vehicle = "/api/technicians/vehicle";
  static const String vehicleMakes = "/api/vehicles/makes";
  static String vehicleModels(String makeId) =>
      "/api/vehicles/models?makeId=$makeId";
  static const String dashboard = "/api/technicians/dashboard";
  static const String deleteAccount = "/api/technicians/delete";

  //! Status (Online / Offline)
  static const String status = "/api/technicians/status";

  //! Background location heartbeat (REST — always sent even when socket is down)
  static const String location = "/api/technicians/location";

  //! Jobs (technician-scoped)
  static const String technicianJobs = "/api/technicians/jobs";
  static const String createTechnicianJob = "/api/technicians/jobs";
  static String acceptJob(String id) => "/api/technicians/jobs/$id/accept";
  static const String fcmToken = "/api/technicians/fcm-token";
  static const String homeHero = "/api/technicians/home-hero";
  static const String createSubscription = "/api/technicians/subscriptions";

  //! Jobs (shared job resource) — REST fallbacks when socket is down
  static String jobById(String id) => "/api/jobs/$id";
  static String jobActivityDetail(String id) => "/api/jobs/$id/activity-detail";
  static String updateJobStatus(String id) => "/api/jobs/$id/status";
  static String updateJobDetails(String id) => "/api/jobs/$id/details";
  static String uploadSignature(String id) => "/api/jobs/$id/signature";
  static String markArrived(String id) => "/api/jobs/$id/arrive";
  static String startJob(String id) => "/api/jobs/$id/start";
  static String completeJob(String id) => "/api/jobs/$id/complete";
  static String cancelJob(String id) => "/api/jobs/$id/cancel";
  static String confirmPayment(String id) => "/api/jobs/$id/payment";
  static String requestHold(String id) => "/api/jobs/$id/hold-request";
  static String addRepair(String id) => "/api/jobs/$id/repairs";
  static String jobTotal(String id) => "/api/jobs/$id/total";
  static String receiptByJob(String id) => "/api/receipts/job/$id";

  //! Session resume
  static const String technicianSession = "/api/jobs/technician/session";
  static const String technicianActiveJob = "/api/jobs/technician/active";

  //! Public content (no auth)
  static const String faqs = "/api/content/faqs";
  static const String privacyPolicy = "/api/content/privacy-policy";
  static const String termsConditions = "/api/content/terms-and-conditions";

  //! Maps proxy (server-side Google Directions / Geocoding)
  static const String mapsDirections = "/api/maps/directions";
  static const String mapsGeocode = "/api/maps/geocode";

  //! Notifications (thin technician stubs)
  static const String technicianNotifications = "/api/notifications/technician";
  static const String technicianNotificationsUnread =
      "/api/notifications/technician/unread-count";
  static const String technicianNotificationsMarkRead =
      "/api/notifications/technician/mark-all-read";
}
