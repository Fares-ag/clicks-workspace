import '../config/app_config.dart';

class EndPoints {
  static String get baseUrl => AppConfig.apiBaseUrl;

  //! Auth End Points
  static const String login = "/api/customers/login";
  static const String register = "/api/customers/register";
  static const String getProfile = "/api/customers/profile";
  static const String getMakes = "/api/vehicles/makes";
  static const String getModels = "/api/vehicles/models";
  static const String vehicles = "/api/vehicles";
  static const String deleteAccount = "/api/customers/delete";

  static const String forgetPassword = "/api/customers/forgot-password";
  static const String verifyResetOtp = "/api/customers/verify-reset-otp";
  static const String resetPassword = "/api/customers/reset-password";
  static const String changePassword = "/api/customers/update-password";
  static const String logout = "/api/customers/logout";
  static const String sendOtp = "/api/customers/otp/send";
  static const String verifyOtp = "/api/customers/otp/verify";
  static const String fcmToken = "/api/customers/fcm-token";

  /// Tips/onboarding content not supported by API — ignore client-side
  static const String onBoarding = "/api/content/faqs";

  static const String contactUs = "/api/contact-us";
  static const String faqs = "/api/content/faqs";
  static const String termsConditions = "/api/content/terms-and-conditions";
  static const String privacyPolicy = "/api/content/privacy-policy";

  // Jobs
  static const String jobs = "/api/jobs";

  // Service requests (non-SOS)
  static const String serviceRequests = "/api/service-requests";
  static const String serviceRequestsActive = "/api/service-requests/active";
  static String cancelServiceRequest(String id) =>
      "/api/service-requests/$id/cancel";

  // Notifications — MVP stub list endpoint (empty OK)
  static const String notifications = "/api/notifications/customer";
  static const String notificationsUnreadCount =
      "/api/notifications/customer/unread-count";
  static const String notificationsMarkAllRead =
      "/api/notifications/customer/mark-all-read";
}
