/// KEEP IN SYNC — web canonical map in clicks-interface, clicks-business-web,
/// clicks-finance-web (clicks-interface/src/utils/jobStatusLabels.js).
/// CI enforces web parity via scripts/check-status-labels.mjs.
///
/// Backend enum: pending, assigned, accepted, en_route, arrived, in_progress,
/// on_hold, completed, cancelled. Legacy: paid, confirmed.
class JobStatusLabels {
  JobStatusLabels._();

  static const Map<String, String> labels = {
    'pending': 'Pending',
    'assigned': 'Assigned',
    'accepted': 'Accepted',
    'en_route': 'En route',
    'arrived': 'Arrived',
    'in_progress': 'In progress',
    'completed': 'Completed',
    'cancelled': 'Cancelled',
    'paid': 'Paid',
    'confirmed': 'Confirmed',
    'on_hold': 'On hold',
  };

  static String labelFor(String? status) {
    final key = (status ?? '').trim().toLowerCase();
    final label = labels[key];
    if (label != null) return label;
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
