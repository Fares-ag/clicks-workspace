import 'package:easy_localization/easy_localization.dart';

/// KEEP IN SYNC — web canonical map in clicks-interface, clicks-business-web,
/// clicks-finance-web (clicks-interface/src/utils/jobStatusLabels.js).
/// CI enforces web parity via scripts/check-status-labels.mjs.
///
/// Backend enum: pending, assigned, accepted, en_route, arrived, in_progress,
/// completed, cancelled. Legacy: paid, confirmed, on_hold.
/// Localized via assets/translations job_status.* keys.
class JobStatusLabels {
  JobStatusLabels._();

  static const Map<String, String> _translationKeys = {
    'pending': 'job_status.pending',
    'assigned': 'job_status.assigned',
    'accepted': 'job_status.accepted',
    'en_route': 'job_status.en_route',
    'arrived': 'job_status.arrived',
    'in_progress': 'job_status.in_progress',
    'completed': 'job_status.completed',
    'cancelled': 'job_status.cancelled',
    'paid': 'job_status.paid',
    'confirmed': 'job_status.confirmed',
    'on_hold': 'job_status.on_hold',
  };

  static String labelFor(String? status) {
    final key = (status ?? '').trim().toLowerCase();
    final trKey = _translationKeys[key];
    if (trKey != null) return trKey.tr();
    return _titleCaseStatus(status ?? '');
  }

  static String _titleCaseStatus(String raw) {
    if (raw.isEmpty) return '';
    return raw.replaceAll('_', ' ').replaceAllMapped(
          RegExp(r'\b\w'),
          (match) => match.group(0)!.toUpperCase(),
        );
  }
}
