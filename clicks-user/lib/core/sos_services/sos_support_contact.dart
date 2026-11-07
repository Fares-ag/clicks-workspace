import 'package:url_launcher/url_launcher.dart';

/// The number a stranded customer is told to call from the SOS flow.
///
/// The server serves it as `support_phone` on `/api/jobs/customer/session`
/// (and on the escalation event), from the admin ops setting or the
/// SUPPORT_PHONE env. Until a session has been fetched we fall back to the
/// single built-in constant.
// INTEGRATION(qw-41/ws-i): fold into the app-wide support constant and
// `/api/config/public.support_phone` once those land.
class SosSupportContact {
  SosSupportContact._();

  static const String fallbackPhone = '+97470090220';

  static String? _served;

  static String get phone =>
      (_served != null && _served!.trim().isNotEmpty) ? _served! : fallbackPhone;

  /// Remember the server-provided number from a session/event payload.
  static void updateFrom(Map<String, dynamic>? data) {
    final raw = data?['support_phone']?.toString().trim();
    if (raw != null && raw.isNotEmpty) _served = raw;
  }

  static Future<void> call() async {
    final uri = Uri(scheme: 'tel', path: phone);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }
}
