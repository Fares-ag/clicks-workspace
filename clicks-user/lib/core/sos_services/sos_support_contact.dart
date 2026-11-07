import 'package:url_launcher/url_launcher.dart';

import '../config/public_config.dart';

/// The number a stranded customer is told to call from the SOS flow.
///
/// A number served on a session or escalation payload (`support_phone`, from
/// the admin ops setting or SUPPORT_PHONE) wins; otherwise this defers to the
/// app-wide [PublicConfig.supportPhone], so every "Call us" button in the app
/// dials the same number (scenario 41).
class SosSupportContact {
  SosSupportContact._();

  static String? _served;

  static String get phone =>
      (_served != null && _served!.trim().isNotEmpty)
          ? _served!
          : PublicConfig.supportPhone;

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
