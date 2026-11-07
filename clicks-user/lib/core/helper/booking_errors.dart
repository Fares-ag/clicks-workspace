import 'package:easy_localization/easy_localization.dart';

String bookingErrorMessage(String? code, [String? fallback]) {
  switch (code) {
    case 'LIVE_JOB_ACTIVE':
      return 'home.live_job_active'.tr();
    case 'LIVE_JOB_VEHICLE_ACTIVE':
      return 'home.live_job_vehicle_active'.tr();
    case 'UNPAID_JOB_HOLD':
      return 'home.payment_needed_body'.tr();
    case 'OUTSIDE_COVERAGE':
      return 'home.outside_coverage'.tr();
    case 'DISPATCH_WINDOW':
      return 'home.dispatch_window'.tr();
    case 'JOB_NOT_CANCELLABLE':
      return 'home.job_not_cancellable'.tr();
    case 'LAUNCH_PUBLIC_SOS_OFF':
      return 'home.sos_unavailable'.tr();
    default:
      return fallback?.isNotEmpty == true
          ? fallback!
          : 'home.cancel_failed'.tr();
  }
}
